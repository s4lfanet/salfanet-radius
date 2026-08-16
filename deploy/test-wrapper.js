const fs = require('fs');
const path = require('path');
const p1 = path.join(process.cwd(), 'frontend', 'public', 'android-template', 'gradle-wrapper.jar');
const p2 = path.join(process.cwd(), 'public', 'android-template', 'gradle-wrapper.jar');
console.log('cwd:', process.cwd());
console.log('p1:', p1, 'exists:', fs.existsSync(p1));
console.log('p2:', p2, 'exists:', fs.existsSync(p2));
