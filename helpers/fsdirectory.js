import fs from 'fs'

export const createDirectoryIfNone = (path) => {
    try {
        fs.mkdirSync(path);
        console.log('Directory created successfully');
      } catch (err) {
        if (err.code === 'EEXIST') {
          console.log('Directory already exists');
        } else {
          console.error('An error occurred:', err);
        }
      }
}

