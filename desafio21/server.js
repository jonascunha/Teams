const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
createApp().listen(port, () => {
  console.log(`Desafio 21 Dias rodando em http://localhost:${port}`);
});
