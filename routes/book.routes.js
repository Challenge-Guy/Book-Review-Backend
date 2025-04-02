import express from 'express';
const multer = require('multer');
import { catchAsync } from '../utils/catchAsync';
import { recommendBook, uploadFile, deleteVectorData } from '../controllers/book.controller';
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

//本のおすすめ結果
router.post(
  '/recommendBook',
  catchAsync(async (req, res) => {
    console.log('/api/book/recommendBook called -', req.body);  
    res.status(200).json(await recommendBook(req));
  })
);

//pineconeにデータアップロード
router.post('/upload', upload.single('file'), 
  catchAsync(async (req, res) => {
    res.status(200).json(await uploadFile(req.file)) 
  })
);

//pineconeでデータ削除
router.delete('/deleteData',
  catchAsync(async (req, res) => {
    res.status(200).json(await deleteVectorData(req))
  })
)

export default router;
