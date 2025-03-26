import path from 'path';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { loadQAChain } from 'langchain/chains';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { StructuredOutputParser, OutputFixingParser } from 'langchain/output_parsers';

import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '../config/pinecone';
import { encode } from 'gpt-tokenizer';
import { getTextFromExcel } from './getText';

dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.PINECONE_ENVIRONMENT || !process.env.PINECONE_API_KEY) {
  throw new Error('Pinecone environment or api key vars missing');
}

//pineconeに接続する
export const initPinecone = async () => {
  try {
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
    console.log('log index-0==', pc.index);

    const indexName = process.env.PINECONE_INDEX_NAME;
    const index = pc.Index(indexName);

    const stats = await index.describeIndexStats();
    console.log('Pinecone connection verified:', {
      indexName,
      dimension: stats.dimension
    });

    return { client: pc, index };
  } catch (error) {
    console.error('Pinecone initialization error', error.message);
    throw error;
  }
};

//pineconeにデータアップロード
export const embeddingPinecone = async (filePath) => {
  console.log('init file', filePath);
  console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);
  try {
    const { index } = await initPinecone();
    const contentsArray = await getTextFromExcel(filePath);
    
    const contents = contentsArray.map(row => Object.values(row).join(' ')).join('\n')
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 3000,
      chunkOverlap: 500,
    });

    const docs = await textSplitter.splitText(contents);

    let token_count = 0;
    docs.map((doc, idx) => {
      token_count += encode(doc).length;
    });

    const metadatas = docs.map(() => {
      return path.basename(filePath, path.extname(filePath));
    });

    
    /*埋め込みを作成してvectorStoreに保存する*/
    const embeddings = new OpenAIEmbeddings();
    console.log('create data embeddigs');

    const result = await PineconeStore.fromTexts(docs, metadatas, embeddings, {
      pineconeIndex: index,
      namespace: PINECONE_NAME_SPACE || 'default',
      textKey: 'text',
    });

    return result;
  } catch (error) {
    return error.message
  }
}

/**
 * @function_name removePineconeData
 * @flag 1: del by all , id: del by id
 * @return none
 * @description delete pinecone database
 */

//pineconeでデータ削除
export const removePineconeData = async (del_flag) => {
  try {
    console.log('accept delete request');

    const { index } = await initPinecone();
    // await index.delete({
    //   deleteAll: true,
    //   namespace: PINECONE_NAME_SPACE,
    // });
    await index.namespace(PINECONE_NAME_SPACE).deleteAll();
    console.log('Pinecone data deleted --------');
  } catch (error) {
    console.log('error', error);
    throw new Error('Failed to delete pinecone data');
  }
};

const isJSON = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

//本のおすすめ結果
export const getRecommendBook = async (question) => {
  // OpenAI recommends replacing newlines with spaces for best results
  console.log('qurestion', question);

  const sanitizedQuestion = question.trim().replaceAll('\n', ' ');

  console.log('sanitizedQA', sanitizedQuestion);

  try {
    const { index } = await initPinecone();

    /* Create vectorstore*/
    const vectorStore = await PineconeStore.fromExistingIndex(new OpenAIEmbeddings({}), {
      pineconeIndex: index,
      textKey: 'text',
      namespace: PINECONE_NAME_SPACE, //namespace comes from your config folder
    });
    
    // Get suitable docs
    let suitableDocs = await vectorStore.similaritySearch(sanitizedQuestion);
    console.log('suitableDocs is : ', suitableDocs);
    const chat_model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      temperature: 1,
      modelName: 'gpt-4-1106-preview',
      verbose: true,
      streaming: true,
      callbacks: [{
        handleLLMNewToken(token) {
          process.stdout.write(token)
        }
      }]
    });

    const outputParser = StructuredOutputParser.fromZodSchema(
      z
        .array(
          z.object({
            title: z.string().describe('The title of book'),
            author: z.string().describe('The author of book'),
            reason: z.string().describe('recommend reason')
          })
        )
        .length(3)
    );
    const outputFixingParser = OutputFixingParser.fromLLM(chat_model, outputParser);

    const prompt = new PromptTemplate({
      template:

        `
        You are a “book review AI chatbot” that specializes in recommending books for philosophical awareness.
      Some books information that you can reference will be provided for this.

        Context Information:
        {context}

        User Question:
        {question}

        The user randomly enters a keyword, proposition, or keyword+proposition.
        Using the data provided, you need to analyze it and recommend the top 3 books that match the input data.
        When making recommendations, generate answers in the language of the input data.
        For example, if the user types in Japanese, the answer will be in Japanese, and if the user types in English, the answer will be in English.

        Title: [Book Title]
        Author: [Author Name]
        Recommendation Reason: [Detailed explanation of the book's relevance]

        Enter the title and author exactly as the data is provided.
        For example, if the title of the book you're recommending is “「昭和」を送る”, don't change it to "昭和を送る", just type “「昭和」を送る”.
        `,
      inputVariables: ['context', 'question'],  // Only input variables you actually need
      partialVariables: {
        format_instructions: outputFixingParser.getFormatInstructions(),
      },
    });

    // Create QA Chain
    const chain = loadQAChain(chat_model, {
      type: 'stuff',
      prompt,
      outputParser: outputFixingParser,
    });

    const res = await chain.call({
      input_documents: suitableDocs,
      question: sanitizedQuestion,
    });

    let result;
    if (isJSON(res.text)) {
      result = JSON.stringify(JSON.parse(res.text).items);
      console.log('JSON------------');
    } else {
      result = res.text;
      console.log('not JSON------------');
    }

    const parsed_data = await outputFixingParser.parse(result);
    console.log('parsed_text---------------------', parsed_data);
    const response = {
      text: parsed_data,
      sourceDocuments: suitableDocs,
    };
    console.log('answer=========', response);

    return response;
  } catch (error) {
    console.log('error', error);
    return error;
  }
}