import path from 'path';
import fs from 'fs'
import { getRecommendBook, embeddingPinecone, removePineconeData } from "../utils/pinecone-helper";

//本のおすすめ結果
export const recommendBook = async (req) => {
  console.log('getMainCourse called : ', req.body.searchData); 
  const question = req.body.searchData;
  console.log('seeachdata----', question); 

  try {
    const result = await getRecommendBook(question);
    if (!result) {
      throw new Error('No recommendations found'); // Handle case where result is undefined
    }
    return result;
  } catch (error) {
    console.error('Error in recommendBook:', error); 
    throw new Error('Failed to recommend book'); // Throw meaningful error
  }
};

//pineconeでデータ削除
export const deleteVectorData = async (req) => {
  console.log('delete data request'); 
  return removePineconeData(req)
}

//pineconeにデータアップロード
export const uploadFile = async (file) => {
  const uploadPath = 'uploads' 
  fs.mkdirSync(uploadPath, { recursive: true }); 
  const filename = Date.now() + "-" + file.originalname;  
  const filePath = path.join(uploadPath, filename);  

  fs.writeFile(filePath, file.buffer, async (err) => {
    if (err) {
      return err;
    }
    file.path = filePath;
    file.filename = filename;
    try {
      return await embeddingPinecone(filePath);  
    } catch (error) {
      console.error('Error in embedding data:', error); 
      throw new Error('Failed to embedding book data'); // Throw meaningful error
    }
  });
}
