import fs from 'fs'
import axios from 'axios';

export async function downloadFile(fileUrl, outputLocationPath) {
    const writer = fs.createWriteStream(outputLocationPath);

    return new Promise(async (resolve, reject) => {
        const response = await axios.get(fileUrl, { responseType: 'stream' });
        response.data.pipe(writer);
        let error = null;
        writer.on('error', err => {
            error = err
            writer.close();
            reject(err);
        });
        writer.on('close', () => {
            if (!error) {
                resolve(true);
            }
        })
    })
}

export async function deleteFile(filePath) {
    return new Promise((resolve, reject) => {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
                reject(err)
            }
            else console.log('File deleted.');
            resolve();
        });
    })
}