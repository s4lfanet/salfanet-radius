// Mock nanoid for Jest (nanoid 5.x is ESM-only, which ts-jest can't parse)
module.exports = {
  nanoid: (size = 21) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < size; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  },
  customAlphabet: (alphabet, size) => {
    return () => {
      let id = '';
      for (let i = 0; i < size; i++) {
        id += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      return id;
    };
  },
};
