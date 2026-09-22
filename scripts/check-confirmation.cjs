const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
let page
let toastOptions
let shareMenuOptions
let bundledFontPath
let cachedFontPath
let loadedFontPath
vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/confirmation/index.js'), 'utf8'), {
  Page: value => { page = value },
  Date,
  wx: {
    env: { USER_DATA_PATH: '/user-data' },
    getFileSystemManager: () => ({
      readFileSync: filePath => {
        bundledFontPath = filePath
        return new Uint8Array([1, 2, 3])
      },
      writeFileSync: filePath => { cachedFontPath = filePath }
    }),
    showShareMenu: options => { shareMenuOptions = options },
    showToast: options => { toastOptions = options }
  }
})
page.setData = patch => Object.assign(page.data, patch)
page.onLoad({
  reservationNumber: 'reservation-001',
  createdAt: '2028-12-30T16%3A05%3A00.000Z',
  checkInDate: '2028-12-31',
  checkOutDate: '2029-01-02',
  nights: '2',
  guestCount: '3',
  roomCount: '2',
  name: encodeURIComponent('测试访客'),
  discountAmountCents: '10000',
  status: 'submitted'
})
assert.deepEqual(JSON.parse(JSON.stringify(shareMenuOptions.menus)), ['shareAppMessage'])
assert.deepEqual(JSON.parse(JSON.stringify(page.onShareAppMessage())), {
  title: 'NE群 × 阿育吠陀体验预约',
  path: '/pages/reservation/index',
  imageUrl: '/assets/cat-display.png'
})
assert.equal(page.onShareTimeline, undefined)
assert.equal(page.loadCanvasFont({
  loadFont: filePath => {
    loadedFontPath = filePath
    return 'LoadedLemi'
  }
}), '"LoadedLemi", sans-serif')
assert.equal(bundledFontPath, '/styles/font-subset.ttf')
assert.equal(cachedFontPath, '/user-data/lemi-milk-foam-subset.ttf')
assert.equal(loadedFontPath, cachedFontPath)
assert.equal(page.data.reservationNumber, 'reservation-001')
assert.equal(page.data.createdAtLabel, '2028-12-31 00:05')
assert.equal(page.data.checkInYear, 2028)
assert.equal(page.data.checkOutYear, 2029)
assert.equal(page.data.checkInShort, '12月31日')
assert.equal(page.data.checkOutShort, '1月2日')
assert.equal(page.data.nights, 2)
assert.equal(page.data.guests, 3)
assert.equal(page.data.rooms, 2)
assert.equal(page.data.name, '测试访客')
assert.equal(page.data.discountLabel, '¥100')
page.setData({ saving: true })
page.finishSave('凭证已保存', 'success')
assert.equal(page.data.saving, false)
assert.equal(toastOptions.title, '凭证已保存')

const fontSize = font => Number((font.match(/([\d.]+)px/) || [0, 10])[1])
const estimatedTextWidth = (text, font) => Array.from(text).reduce((width, character) => {
  return width + fontSize(font) * (/^[\x00-\xff]$/.test(character) ? 0.6 : 1)
}, 0)
const textCalls = []
const filledPaths = []
let currentPath = []
const drawContext = {
  fillStyle: '', strokeStyle: '', font: '', textAlign: 'left', lineWidth: 1,
  fillRect() {},
  beginPath() { currentPath = [] },
  moveTo(x, y) { currentPath.push([x, y]) },
  lineTo(x, y) { currentPath.push([x, y]) },
  arcTo(x1, y1, x2, y2) { currentPath.push([x1, y1], [x2, y2]) },
  closePath() {},
  fill() {
    filledPaths.push({
      fillStyle: this.fillStyle,
      bottom: Math.max(...currentPath.map(([, y]) => y))
    })
  },
  stroke() {},
  measureText(text) { return { width: estimatedTextWidth(text, this.font) } },
  fillText(text, x, y) {
    textCalls.push({ text, x, y, font: this.font, textAlign: this.textAlign })
  }
}
page.drawVoucher(drawContext, 345, 560, 'LemiCanvas')
const headerTitle = textCalls.find(call => call.text === '预约申请凭证')
const reservationNumber = textCalls.find(call => call.text.startsWith('预约编号 '))
const titleRight = headerTitle.x + estimatedTextWidth(headerTitle.text, headerTitle.font)
const numberLeft = reservationNumber.x - estimatedTextWidth(reservationNumber.text, reservationNumber.font)
assert(headerTitle.y !== reservationNumber.y || numberLeft >= titleRight + 8, '凭证标题与预约编号不能重叠')
const whiteCard = filledPaths.find(path => path.fillStyle === '#ffffff')
const submittedAt = textCalls.find(call => call.text.startsWith('提交时间 '))
assert(submittedAt.y + fontSize(submittedAt.font) * 0.35 <= whiteCard.bottom - 8, '提交时间必须完整位于白色卡片内')
assert(textCalls.every(call => call.font.includes('LemiCanvas')), '凭证文字必须使用传入的 Canvas 字体')

const fontSubset = path.join(root, 'miniprogram/styles/font-subset.ttf')
assert(fs.existsSync(fontSubset), 'Canvas 字体子集必须存在')
assert(fs.statSync(fontSubset).size < 200 * 1024, 'Canvas 字体子集必须小于 200 KB')

const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/confirmation/index.wxml'), 'utf8')
for (const [, handler] of wxml.matchAll(/(?:bind\w+|catch\w+)="(\w+)"/g)) assert.equal(typeof page[handler], 'function', handler)
assert(wxml.includes('保存预约凭证'))
assert(wxml.includes('预约申请已提交，尚未确认订房'))
assert(wxml.includes('{{reservationNumber}}'))
assert(wxml.includes('{{createdAtLabel}}'))
assert(!wxml.includes('凭证预览'))
assert(!wxml.includes('尚未提交'))
assert(!wxml.includes('{{wechat}}'))
assert(wxml.includes('{{discountLabel}} 入住优惠'))
console.log('PASS: 凭证页安全分享、服务端编号、日期与创建时间，提交未确认语义、隐私展示、社群优惠、保存反馈与事件绑定')
