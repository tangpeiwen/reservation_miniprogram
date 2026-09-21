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
      this.drawVoucher(ctx, width, height)
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
  drawVoucher(ctx, width, height) {
    const brown = '#402c25'
    const muted = '#5f6e7e'
    ctx.fillStyle = '#f0f8fc'
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = brown
    ctx.font = '700 27px LemiMilkFoam, sans-serif'
    ctx.fillText('预约凭证', 24, 50)
    ctx.fillStyle = '#2e658f'
    ctx.font = '16px LemiMilkFoam, sans-serif'
    ctx.fillText('申请已提交', 25, 78)

    ctx.fillStyle = '#ffffff'
    roundRect(ctx, 14, 104, width - 28, 370, 14)
    ctx.fill()

    ctx.fillStyle = brown
    ctx.font = '700 21px LemiMilkFoam, sans-serif'
    ctx.fillText('预约申请凭证', 32, 143)
    ctx.fillStyle = muted
    ctx.font = '12px LemiMilkFoam, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`预约编号 ${fitText(this.data.reservationNumber, 18)}`, width - 32, 143)
    ctx.textAlign = 'left'

    ctx.strokeStyle = '#e1eaf1'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(32, 163); ctx.lineTo(width - 32, 163); ctx.stroke()
    ctx.fillStyle = muted
    ctx.font = '13px LemiMilkFoam, sans-serif'
    ctx.fillText(`入住 · ${this.data.checkInYear}年`, 32, 193)
    ctx.textAlign = 'right'; ctx.fillText(`离店 · ${this.data.checkOutYear}年`, width - 32, 193)
    ctx.fillStyle = brown
    ctx.font = '22px LemiMilkFoam, sans-serif'
    ctx.textAlign = 'left'; ctx.fillText(this.data.checkInShort, 32, 225)
    ctx.textAlign = 'right'; ctx.fillText(this.data.checkOutShort, width - 32, 225)
    ctx.strokeStyle = '#8da8bf'; ctx.beginPath(); ctx.moveTo(151, 216); ctx.lineTo(194, 216); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(188, 211); ctx.lineTo(194, 216); ctx.lineTo(188, 221); ctx.stroke()

    ctx.fillStyle = '#edf7ff'
    roundRect(ctx, 32, 250, width - 64, 47, 8); ctx.fill()
    ctx.fillStyle = '#3f5265'; ctx.font = '17px LemiMilkFoam, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${this.data.nights} 晚  ·  ${this.data.guests} 人  ·  ${this.data.rooms} 间双人房`, width / 2, 280)

    ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = '15px LemiMilkFoam, sans-serif'; ctx.fillText('预约人', 32, 338)
    ctx.textAlign = 'right'; ctx.fillStyle = brown; ctx.font = '17px LemiMilkFoam, sans-serif'; ctx.fillText(fitText(this.data.name, 12), width - 32, 338)
    ctx.strokeStyle = '#e1eaf1'; ctx.beginPath(); ctx.moveTo(32, 359); ctx.lineTo(width - 32, 359); ctx.stroke()

    ctx.fillStyle = '#fff5ea'
    roundRect(ctx, 32, 380, width - 64, 55, 8); ctx.fill()
    ctx.textAlign = 'left'; ctx.fillStyle = '#7d4930'; ctx.font = '15px LemiMilkFoam, sans-serif'
    ctx.fillText('社群专属', 46, 403)
    ctx.fillStyle = '#695f59'; ctx.font = '10px LemiMilkFoam, sans-serif'
    ctx.fillText('使用方式以工作人员确认为准', 46, 420)
    ctx.textAlign = 'right'; ctx.fillStyle = '#a84b24'; ctx.font = '700 16px LemiMilkFoam, sans-serif'
    ctx.fillText(`${this.data.discountLabel} 入住优惠`, width - 46, 412)

    ctx.textAlign = 'center'; ctx.fillStyle = muted; ctx.font = '13px LemiMilkFoam, sans-serif'
    ctx.fillText('预约申请已提交，尚未确认订房', width / 2, 456)
    ctx.font = '11px LemiMilkFoam, sans-serif'
    ctx.fillText(`提交时间 ${this.data.createdAtLabel}`, width / 2, 474)

    ctx.fillStyle = brown; ctx.font = '700 16px LemiMilkFoam, sans-serif'
    ctx.fillText('NE群 × 阿育吠陀体验预约', width / 2, 526)
  }
})
