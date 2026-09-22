function decode(value, fallback = '') {
  if (value === undefined) return fallback
  try { return decodeURIComponent(value) } catch (error) { return fallback }
}

function dateParts(value) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function shortDate(value) {
  const { month, day } = dateParts(value)
  return `${month}月${day}日`
}

function fitText(value, limit) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function fitCanvasText(ctx, value, maxWidth) {
  if (ctx.measureText(value).width <= maxWidth) return value
  let shortened = value
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened}…`
}

function createdAtLabel(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return [
    `${beijing.getUTCFullYear()}-${String(beijing.getUTCMonth() + 1).padStart(2, '0')}-${String(beijing.getUTCDate()).padStart(2, '0')}`,
    `${String(beijing.getUTCHours()).padStart(2, '0')}:${String(beijing.getUTCMinutes()).padStart(2, '0')}`
  ].join(' ')
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

Page({
  data: {
    reservationNumber: '', createdAtLabel: '', checkInYear: '', checkOutYear: '', checkInShort: '', checkOutShort: '', nights: 2, guests: 2, rooms: 1,
    name: '', discountLabel: '', saving: false
  },
  onLoad(options) {
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] })
    }
    const date = decode(options.checkInDate)
    const checkout = decode(options.checkOutDate)
    const nights = Number(options.nights)
    const checkIn = dateParts(date)
    const checkOut = dateParts(checkout)
    this.setData({
      reservationNumber: decode(options.reservationNumber),
      createdAtLabel: createdAtLabel(decode(options.createdAt)),
      checkInYear: checkIn.year,
      checkOutYear: checkOut.year,
      checkInShort: shortDate(date),
      checkOutShort: shortDate(checkout),
      nights,
      guests: Number(options.guestCount),
      rooms: Number(options.roomCount),
      name: decode(options.name),
      discountLabel: `¥${Number(options.discountAmountCents) / 100}`
    })
  },
  onShareAppMessage() {
    return {
      title: 'NE群 × 阿育吠陀体验预约',
      path: '/pages/reservation/index',
      imageUrl: '/assets/cat-display.png'
    }
  },
  loadCanvasFont(canvas) {
    const fallback = '"LemiMilkFoam", sans-serif'
    if (!canvas || typeof canvas.loadFont !== 'function' || !wx.getFileSystemManager || !wx.env) return fallback
    try {
      const fileSystem = wx.getFileSystemManager()
      const fontPath = `${wx.env.USER_DATA_PATH}/lemi-milk-foam-subset.ttf`
      let fontData
      try {
        fontData = fileSystem.readFileSync('/styles/font-subset.ttf')
      } catch (error) {
        fontData = fileSystem.readFileSync('styles/font-subset.ttf')
      }
      fileSystem.writeFileSync(fontPath, fontData)
      const family = canvas.loadFont(fontPath)
      return family ? `"${String(family).replace(/"/g, '')}", sans-serif` : fallback
    } catch (error) {
      return fallback
    }
  },
  saveVoucher() {
    if (this.data.saving) return
    this.setData({ saving: true })
    const query = wx.createSelectorQuery()
    query.select('#voucherCanvas').fields({ node: true, size: true }).exec(result => {
      const canvasInfo = result && result[0]
      if (!canvasInfo || !canvasInfo.node) return this.finishSave('凭证生成失败，请直接截图')
      const canvas = canvasInfo.node
      const ctx = canvas.getContext('2d')
      const dpr = wx.getSystemInfoSync().pixelRatio || 2
      const width = 345
      const height = 560
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)
      this.drawVoucher(ctx, width, height, this.loadCanvasFont(canvas))
      wx.canvasToTempFilePath({
        canvas,
        destWidth: width * dpr,
        destHeight: height * dpr,
        success: file => wx.saveImageToPhotosAlbum({
          filePath: file.tempFilePath,
          success: () => this.finishSave('凭证已保存', 'success'),
          fail: () => this.finishSave('保存失败，请检查相册权限')
        }),
        fail: () => this.finishSave('凭证生成失败，请直接截图')
      })
    })
  },
  finishSave(title, icon = 'none') {
    this.setData({ saving: false })
    if (wx.showToast) wx.showToast({ title, icon })
  },
  drawVoucher(ctx, width, height, fontFamily = '"LemiMilkFoam", sans-serif') {
    const brown = '#402c25'
    const muted = '#5f6e7e'
    const font = (size, weight = '') => `${weight ? `${weight} ` : ''}${size}px ${fontFamily}`
    ctx.fillStyle = '#f0f8fc'
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = brown
    ctx.font = font(27, '700')
    ctx.fillText('预约凭证', 24, 50)
    ctx.fillStyle = '#2e658f'
    ctx.font = font(16)
    ctx.fillText('申请已提交', 25, 78)

    ctx.fillStyle = '#ffffff'
    roundRect(ctx, 14, 104, width - 28, 390, 14)
    ctx.fill()

    ctx.fillStyle = brown
    ctx.font = font(21, '700')
    ctx.fillText('预约申请凭证', 32, 140)
    ctx.fillStyle = muted
    ctx.font = font(11)
    ctx.fillText(fitCanvasText(ctx, `预约编号 ${this.data.reservationNumber}`, width - 64), 32, 161)

    ctx.strokeStyle = '#e1eaf1'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(32, 175); ctx.lineTo(width - 32, 175); ctx.stroke()
    ctx.fillStyle = muted
    ctx.font = font(13)
    ctx.fillText(`入住 · ${this.data.checkInYear}年`, 32, 204)
    ctx.textAlign = 'right'; ctx.fillText(`离店 · ${this.data.checkOutYear}年`, width - 32, 204)
    ctx.fillStyle = brown
    ctx.font = font(22)
    ctx.textAlign = 'left'; ctx.fillText(this.data.checkInShort, 32, 236)
    ctx.textAlign = 'right'; ctx.fillText(this.data.checkOutShort, width - 32, 236)
    ctx.strokeStyle = '#8da8bf'; ctx.beginPath(); ctx.moveTo(151, 227); ctx.lineTo(194, 227); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(188, 222); ctx.lineTo(194, 227); ctx.lineTo(188, 232); ctx.stroke()

    ctx.fillStyle = '#edf7ff'
    roundRect(ctx, 32, 255, width - 64, 47, 8); ctx.fill()
    ctx.fillStyle = '#3f5265'; ctx.font = font(17); ctx.textAlign = 'center'
    ctx.fillText(`${this.data.nights} 晚  ·  ${this.data.guests} 人  ·  ${this.data.rooms} 间双人房`, width / 2, 285)

    ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = font(15); ctx.fillText('预约人', 32, 340)
    ctx.textAlign = 'right'; ctx.fillStyle = brown; ctx.font = font(17); ctx.fillText(fitText(this.data.name, 12), width - 32, 340)
    ctx.strokeStyle = '#e1eaf1'; ctx.beginPath(); ctx.moveTo(32, 361); ctx.lineTo(width - 32, 361); ctx.stroke()

    ctx.fillStyle = '#fff5ea'
    roundRect(ctx, 32, 378, width - 64, 55, 8); ctx.fill()
    ctx.textAlign = 'left'; ctx.fillStyle = '#7d4930'; ctx.font = font(15)
    ctx.fillText('社群专属', 46, 401)
    ctx.fillStyle = '#695f59'; ctx.font = font(10)
    ctx.fillText('使用方式以工作人员确认为准', 46, 418)
    ctx.textAlign = 'right'; ctx.fillStyle = '#a84b24'; ctx.font = font(16, '700')
    ctx.fillText(`${this.data.discountLabel} 入住优惠`, width - 46, 410)

    ctx.textAlign = 'center'; ctx.fillStyle = muted; ctx.font = font(13)
    ctx.fillText('预约申请已提交，尚未确认订房', width / 2, 459)
    ctx.font = font(11)
    ctx.fillText(`提交时间 ${this.data.createdAtLabel}`, width / 2, 477)

    ctx.fillStyle = brown; ctx.font = font(16, '700')
    ctx.fillText('NE群 × 阿育吠陀体验预约', width / 2, 531)
  }
})
