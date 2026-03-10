const sharp = require('sharp');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#1e40af"/>
  <text x="512" y="650" text-anchor="middle" font-size="580" font-family="Arial" font-weight="bold" fill="white">S</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile('assets/icon.png')
  .then(info => {
    console.log('Icon created:', info);
    // Also create splash.png
    return sharp(Buffer.from(svg.replace('1024', '2048').replace('1024', '2048'))).png().toFile('assets/splash.png');
  })
  .then(info => console.log('Splash created:', info))
  .catch(err => console.error('Error:', err));
