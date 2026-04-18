async function start() {
  try {
    const app = require('./src/app');
    const { PORT } = require('./src/config/env');

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });

  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

start();