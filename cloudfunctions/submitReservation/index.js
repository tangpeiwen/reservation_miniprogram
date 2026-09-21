const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const DAY_MS = 24 * 60 * 60 * 1000

class ValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ValidationError'
  }
}

function beijingToday() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0'), String(now.getUTCDate()).padStart(2, '0')].join('-')
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError('入住日期格式不正确')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new ValidationError('入住日期不存在')
  }
  return date
}

function addDays(value, count) {
  const date = parseDate(value)
  const result = new Date(date.getTime() + count * DAY_MS)
  return [result.getUTCFullYear(), String(result.getUTCMonth() + 1).padStart(2, '0'), String(result.getUTCDate()).padStart(2, '0')].join('-')
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new ValidationError(`${label}必须是正整数`)
  return value
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string') throw new ValidationError(`请填写${label}`)
  const text = value.trim()
  if (!text) throw new ValidationError(`请填写${label}`)
  if (text.length > maxLength) throw new ValidationError(`${label}不能超过 ${maxLength} 个字符`)
  return text
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new ValidationError(`${label}格式不正确`)
  const text = value.trim()
  if (text.length > maxLength) throw new ValidationError(`${label}不能超过 ${maxLength} 个字符`)
  return text
}

function reservationNumberFor(value) {
  const beijing = new Date(value.getTime() + 8 * 60 * 60 * 1000)
  const datePart = `${String(beijing.getUTCFullYear()).slice(-2)}${String(beijing.getUTCMonth() + 1).padStart(2, '0')}${String(beijing.getUTCDate()).padStart(2, '0')}`
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase()
  return `AYV-${datePart}-${randomPart}`
}

function reservationFrom(event) {
  const checkInDate = event && event.checkInDate
  parseDate(checkInDate)
  if (checkInDate <= beijingToday()) throw new ValidationError('入住日期必须晚于今天')

  const nights = event.nights
  if (nights !== 1 && nights !== 2) throw new ValidationError('入住晚数只能是 1 或 2 晚')

  const guestCount = positiveInteger(event.guestCount, '入住人数')
  const roomCount = positiveInteger(event.roomCount, '房间数')
  if (roomCount * 2 < guestCount) throw new ValidationError('房间数不足，每间最多入住 2 人')

  return {
    checkInDate,
    checkOutDate: addDays(checkInDate, nights),
    nights,
    guestCount,
    roomCount,
    name: requiredText(event.name, '名字', 40),
    wechatId: requiredText(event.wechatId, '微信号', 80),
    notes: optionalText(event.notes, '备注', 500),
    status: 'submitted',
    discountAmountCents: 10000
  }
}

exports.main = async event => {
  try {
    const reservation = reservationFrom(event)
    const createdAt = new Date()
    reservation.reservationNumber = reservationNumberFor(createdAt)
    await db.collection('reservations').add({
      data: { ...reservation, createdAt }
    })
    return {
      ok: true,
      reservation: {
        ...reservation,
        createdAt: createdAt.toISOString()
      }
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return { ok: false, error: { code: 'INVALID_RESERVATION', message: error.message } }
    }
    console.error('submitReservation failed', error && error.message)
    return { ok: false, error: { code: 'SAVE_FAILED', message: '预约保存失败，请稍后重试' } }
  }
}
