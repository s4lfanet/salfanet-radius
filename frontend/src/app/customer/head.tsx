export default function Head() {
  return (
    <>
      <title>Customer Portal</title>
      <meta name="application-name" content="Customer Portal" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="Customer Portal" />
      <meta name="theme-color" content="#06b6d4" />
      <meta name="mobile-web-app-capable" content="yes" />
      <link rel="manifest" href="/manifest.json" />
      <link rel="apple-touch-icon" href="/api/pwa/icon?size=180&maskable=1" />
      <link rel="icon" href="/api/pwa/icon?size=192" type="image/png" />
    </>
  );
}