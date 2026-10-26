# Motor de lentes AR do Loooply — arquitetura e distribuição

## Objetivo e situação da implementação

Substituímos os filtros de cor Quente, Frio, P&B e Vivo por **Zoião**, **Bocão**, **Clown**, **Óculos 3D** e **Skincare**, além da opção Original. São implementações próprias, não pacotes ou efeitos exclusivos do Instagram/Snapchat. Esses efeitos ainda precisam de avaliação visual e de performance nos dispositivos reais; testes automatizados não garantem a mesma aparência em todos os rostos.

A câmera, fotos/vídeos, Boomerang, editor, privacidade, Neon e publicação de Stories permanecem separados deste módulo.

## Tecnologia, propriedade e custos

| Componente | Uso | Licença/custo |
|---|---|---|
| Google MediaPipe Face Landmarker | 478 pontos faciais, blendshapes, pose/matriz facial; executa dentro do dispositivo | Código Apache-2.0; modelos devem ter suas licenças e termos verificados |
| WebGL 1 | shader de *deformação real dos pixels* nas regiões dos olhos e da boca | API padrão do navegador, sem licença comercial |
| Canvas 2D | maquiagem, máscara de skincare e fallback para GPUs não suportadas | API padrão, sem licença comercial |
| Three.js | óculos virtuais 3D feitos de geometrias próprias, luz, material e orientação de cabeça | MIT; renderização WebGL opcional |
| glTF/GLB + GLTFLoader | alternativa futura para acessórios modelados no Blender | Especificação royalty-free; cada arquivo 3D precisa de licença de redistribuição |
| GitHub Pages | catálogo/index/manifests e código | gratuito dentro dos limites e políticas do serviço |

O **código do motor não exige assinatura ou pagamento por usuários ativos**. Rede, armazenamento e serviços de terceiros podem ter franquias, limites de uso e políticas próprias; “sem SDK pago” não significa que qualquer escala de servidor é grátis para sempre.

### Estrutura implantada

~~~text
src/
  story-ar.js           MediaPipe + loop de frames e composição
  story-ar-warp.js      WebGL shader para Zoião/Bocão + fallback 2D
  story-ar-paint.js     Clown / máscara skincare + fallback 2D de óculos
  story-ar-3d.js        Óculos 3D procedurais com Three.js
  story-ar-catalog.js   carregamento/validação de lentes do servidor
  story-studio.js       câmera, faixa horizontal e exportação
assets/story-effects/
  index.json            índice de efeitos, versão, nomes e arquivos
  lenses/
    none.json
    big-eyes.json
    big-mouth.json
    clown.json
    sunglasses.json
    skincare.json
~~~

### O manifesto de uma lente

Exemplo: \`assets/story-effects/lenses/big-eyes.json\`.

~~~json
{
  "schemaVersion": 1,
  "id": "big-eyes",
  "type": "warp",
  "strength": 0.72,
  "params": {},
  "assets": {
    "model": null,
    "texture": null
  },
  "license": "original-looply-procedural"
}
~~~

Em \`index.json\` adicione uma entrada com \`id\`, \`name\`, \`symbol\`, \`type\`, \`file\`; inclua o JSON correspondente em \`lenses/\`. Tipos suportados neste release: \`none\`, \`warp\`, \`paint\`, \`accessory\`. **Novo nome/ícone, parâmetros e intensidades** podem ser alterados apenas nos JSONs; novos **tipos** ou geometrias precisam de implementação de código. Não carregamos JS arbitrário de manifests.

Para modelos 3D personalizáveis num release posterior:

~~~text
assets/story-effects/lenses/meu-oculos.json
assets/story-effects/models/meu-oculos.glb
assets/story-effects/textures/lente.webp
assets/story-effects/shaders/warp.frag.glsl
~~~

O formato GLB compacta cena/geometria/textura num arquivo e pode ser carregado por \`GLTFLoader\` de Three.js. **O carregamento de GLB externo ainda não está implementado neste release**; os óculos 3D atuais são produzidos com malhas procedurais e o JSON controla a escolha do efeito. Publicar arquivos não torna automaticamente disponíveis formatos/modelos que o motor ainda não interpreta.

### Pipeline real da câmera

~~~text
getUserMedia(HTTPS)  →  HTMLVideoElement
                            ↓
                  MediaPipe FaceLandmarker
                   (aprox. 15 inferências/s)
                            ↓
                478 landmarks em coordenadas
                            ↓
      [lente selecionada → busca JSON do próprio servidor]
                            ↓
    ┌──────────────────┬───────────────────────┐
    │ Distorção        │ Maquiagem / acessórios│
    │ WebGL shader     │ Canvas 2D / Three.js  │
    │ olhos ou boca    │ alinhados à cabeça    │
    └──────────────────┴───────────────────────┘
                            ↓
               Canvas composto na prévia
                            ↓
  captura de foto / MediaRecorder → vídeo final com efeito
                            ↓
                upload já existente no Neon
~~~

Visão conceitual:

~~~js
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user" }, audio: true
});
video.srcObject = stream;
const catalog = await loadStoryEffectCatalog();
const selected = catalog.find(item => item.id === "big-eyes");
const manifest = await loadStoryEffectManifest(selected);
const engine = new StoryFaceLens(video, overlayCanvas, () => "user");
await engine.prepare();               // MediaPipe, GPU ou fallback CPU
await engine.setLens(manifest);       // manifest 100% do seu servidor
engine.start();                       // tracking → shader → overlay
// A captura posterior compõe video + overlay em um canvas e gera o arquivo.
~~~

### Melhorias e limites

- Alvo: 30 fps de desenho e no máximo ~15 fps de inferência; framebuffer com largura até 720 px. Não é promessa de 30 fps para todos os Android e iPhones.
- MediaPipe detecta **um rosto por vez** para reduzir custo. GPU primeiro, CPU como alternativa.
- Shader aplica deformação radial real, com fallback Canvas se WebGL falhar.
- O rastreamento roda no navegador e as imagens do rosto não são enviadas ao servidor para detectar landmarks.
- A malha 3D via Three.js carrega sob demanda; se Three.js ou WebGL falhar, o app desenha óculos 2D.
- Otimizações futuras: bundles WASM/ML localizados no próprio Pages (remover dependência do CDN de modelos), asset packs .glb, controle de qualidade automático por FPS, teste de múltiplos rostos, tratamentos de oclusão refinados.
- Efeitos de deformação podem variar na câmera frontal, dependendo do recorte e do espelhamento. Recomenda-se teste no Chrome Android e Safari iOS reais antes de considerar produção visual perfeita.

## Fontes técnicas

- MediaPipe Face Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
- Modelos e licença do código MediaPipe: https://github.com/google-ai-edge/mediapipe
- Three.js: https://threejs.org/docs/pages/GLTFLoader
- Three.js licença: https://github.com/mrdoob/three.js/blob/master/LICENSE
- glTF 2.0: https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc
- Alternativa TensorFlow.js face-landmarks-detection: https://github.com/tensorflow/tfjs-models/tree/master/face-landmarks-detection (Apache-2.0)

O código permanece versionado em \`soumoiss/Looply\`, e o deploy da \`main\` é realizado pelo GitHub Actions / GitHub Pages.
