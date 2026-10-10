const { createApp } = require('./src/app');

const port = Number(process.env.PORT) || 3000;
createApp()
  .then((app) => app.listen(port, () => console.log(`Desafio 21 Dias rodando na porta ${port}`)))
  .catch((err) => {
    console.error('Falha ao iniciar:', err);
    process.exit(1);
  });
