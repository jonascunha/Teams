# Guia das Personais (PDF)

Guia de uso do app para as personal trainers, com capturas de tela reais de uma turma de exemplo.

Para gerar de novo (por exemplo, depois de mudar o app), a partir desta pasta:

```bash
NODE_PATH=$(npm root -g) node capturas.js "$PWD/shots" "$PWD/.dados-exemplo"   # captura as telas (precisa do Playwright)
NODE_PATH=$(npm root -g) node pdf.js "$PWD/guia.html" "$PWD/Guia das Personais - Desafio 21 Dias MOOH.pdf"
```

O texto do guia está em `guia.html`. As datas do calendário (página 3) consideram início em 10/11/2026.
