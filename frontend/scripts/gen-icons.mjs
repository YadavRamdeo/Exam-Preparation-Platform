import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'

const outDir = path.resolve(process.cwd(), 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

function hexToRgb(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r: 0, g: 0, b: 0 }
}

function generate(size, bg = '#0b1220', acc = '#6aa1ff'){
  const png = new PNG({ width: size, height: size })
  const bgc = hexToRgb(bg)
  const ac = hexToRgb(acc)
  const thickness = Math.max(2, Math.floor(size * 0.04))

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2
      // background
      png.data[idx] = bgc.r
      png.data[idx+1] = bgc.g
      png.data[idx+2] = bgc.b
      png.data[idx+3] = 255
      // diagonal accent stripe
      if (Math.abs(x - y) < thickness || Math.abs(x + y - size) < thickness) {
        png.data[idx] = ac.r
        png.data[idx+1] = ac.g
        png.data[idx+2] = ac.b
      }
    }
  }

  const outPath = path.join(outDir, `icon-${size}.png`)
  png.pack().pipe(fs.createWriteStream(outPath))
}

generate(192)
generate(512)
console.log('Icons written to', outDir)
