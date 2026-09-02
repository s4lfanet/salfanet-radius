const b=require('bcryptjs');
const h=b.hashSync('admin123',10);
require('fs').writeFileSync('/tmp/hash.txt',h);
console.log('done');
