# Guia das Personais (PDF)

Guia de uso do app para as personal trainers, com capturas de tela reais de uma turma de exemplo.

Para gerar de novo (por exemplo, depois de mudar o app), a partir desta pasta:

```bash
NODE_PATH=$(npm root -g) node capturas.js "$PWD/shots" "$PWD/.dados-exemplo"   # captura as telas (precisa do Playwright)
NODE_PATH=$(npm root -g) node pdf.js "$PWD/guia.html" "$PWD/Guia das Personais - Desafio 21 Dias MOOH.pdf"
```

O texto do guia está em `guia.html`. As datas do calendário (página 3) consideram início em 10/11/2026.

## Vídeo

`video.js` grava o app rodando com a mesma turma de exemplo (`turma-exemplo.js`), com legendas e marcação de toque, em `.webm`. Para gerar o `.mp4`:

```bash
NODE_PATH=$(npm root -g) node video.js "$PWD/.video" "$PWD/.dados-exemplo"
pip install imageio-ffmpeg   # traz um ffmpeg com H.264
FF=$(python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())")
$FF -ss "$(cat .video/inicio.txt)" -i .video/guia-personais.webm -vf "fps=30,scale=780:1328:flags=lanczos" \
  -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart -an "Video - Guia das Personais - Desafio 21 Dias.mp4"
```
