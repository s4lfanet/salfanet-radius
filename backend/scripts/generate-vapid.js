const webpush = require('web-push');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Add these values to your .env file:');
console.log('');
console.log(`VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log('VAPID_CONTACT_EMAIL="admin@example.com"');