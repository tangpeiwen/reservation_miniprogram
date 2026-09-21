const DAY_MS = 24 * 60 * 60 * 1000

function beijingToday() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0'), String(now.getUTCDate()).padStart(2, '0')].join('-')
}

function isFutureDate(value) {
  return Boolean(value) && value > beijingToday()
}

function capacityErrorFor(guests, rooms) {
  return rooms * 2 >= guests ? '' : '房间数不足，每间最多入住 2 人'
}

function dateInfo(value, nights) {
  const [year, month, day] = value.split('-').map(Number)
  const end = new Date(Date.UTC(year, month - 1, day) + nights * DAY_MS)
  return {
    dateLabel: `${year}年${month}月${day}日`,
    stayLabel: `${month}月${day}日入住 → ${end.getUTCMonth() + 1}月${end.getUTCDate()}日离店`
  }
}
function monthInfo(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const y = first.getUTCFullYear(), m = first.getUTCMonth() + 1
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const today = beijingToday()
  const calendarDays = Array.from({ length: first.getUTCDay() }, (_, i) => ({ key: 'blank-' + i }))
  for (let day = 1; day <= count; day++) {
    const value = [y, String(m).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
    calendarDays.push({ key: value, value, day, disabled: value <= today })
  }
  return { calendarYear: y, calendarMonth: m, calendarDays }
}
Page({
  data: {
    date: '', dateConfirmed: false, nights: 2, guests: 2, rooms: 1,
    name: '', wechat: '', notes: '', reviewVisible: false, reviewConfirmed: false, submitting: false, submitError: '',
    dateError: '', capacityError: '', nameError: '', wechatError: '', focusField: '',
    calendarVisible: false, pendingDate: '', pendingDateLabel: '', calendarDays: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    dateLabel: '', stayLabel: ''
  },
  onLoad() {
    // 以北京时间当天初始化；返回弹层不重置用户已选日期。
    const date = beijingToday()
    this.setData({ date, ...dateInfo(date, this.data.nights) })
  },
  openCalendar() {
    const [year, month] = this.data.date.split('-').map(Number)
    this.setData({ calendarVisible: true, pendingDate: this.data.date, pendingDateLabel: this.data.dateLabel, ...monthInfo(year, month) })
  },
  closeCalendar() { this.setData({ calendarVisible: false }) },
  changeMonth(event) {
    this.setData(monthInfo(this.data.calendarYear, this.data.calendarMonth + Number(event.currentTarget.dataset.delta)))
  },
  selectDay(event) {
    const pendingDate = event.currentTarget.dataset.date
    if (!isFutureDate(pendingDate)) return
    this.setData({ pendingDate, pendingDateLabel: dateInfo(pendingDate, this.data.nights).dateLabel })
  },
  confirmDate() {
    const date = this.data.pendingDate
    if (!isFutureDate(date)) {
      this.setData({ dateError: '请选择明天或之后的日期' })
      return
    }
    this.setData({ date, dateConfirmed: true, dateError: '', reviewConfirmed: false, calendarVisible: false, ...dateInfo(date, this.data.nights) })
  },
  changeNights(event) {
    const nights = Number(event.currentTarget.dataset.value)
    if (nights !== 1 && nights !== 2) return
    this.setData({ nights, reviewConfirmed: false, ...dateInfo(this.data.date, nights) })
  },
  step(event) {
    const { field, delta } = event.currentTarget.dataset
    if (field !== 'guests' && field !== 'rooms') return
    const value = Math.max(1, this.data[field] + Number(delta))
    const guests = field === 'guests' ? value : this.data.guests
    const rooms = field === 'rooms' ? value : this.data.rooms
    const capacityError = capacityErrorFor(guests, rooms)
    this.setData({ [field]: value, capacityError, reviewConfirmed: false })
  },
  input(event) {
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    const patch = { [field]: value, reviewConfirmed: false, submitError: '' }
    if ((field === 'name' || field === 'wechat') && value.trim()) {
      patch[`${field}Error`] = ''
      patch.focusField = ''
    }
    this.setData(patch)
  },
  openReview() {
    const dateError = this.data.dateConfirmed && isFutureDate(this.data.date) ? '' : '请选择明天或之后的日期'
    const capacityError = capacityErrorFor(this.data.guests, this.data.rooms)
    const name = this.data.name.trim()
    const wechat = this.data.wechat.trim()
    const nameError = name ? '' : '请填写名字'
    const wechatError = wechat ? '' : '请填写微信号'
    if (dateError || capacityError || nameError || wechatError) {
      this.setData({
        dateError,
        dateConfirmed: dateError ? false : this.data.dateConfirmed,
        capacityError,
        nameError,
        wechatError,
        focusField: dateError || capacityError ? '' : nameError ? 'name' : 'wechat',
        reviewVisible: false,
        reviewConfirmed: false
      })
      if (dateError) this.openCalendar()
      else if (capacityError && typeof wx !== 'undefined' && wx.pageScrollTo) {
        wx.pageScrollTo({ selector: '.capacity-error', duration: 200 })
      }
      return
    }
    this.setData({ name, wechat, dateError: '', capacityError: '', nameError: '', wechatError: '', focusField: '', reviewVisible: true })
  },
  closeReview() { this.setData({ reviewVisible: false }) },
  async confirmReview() {
    if (this.data.submitting) return
    this.setData({ submitting: true, submitError: '' })
    const { date, nights, guests, rooms, name, wechat, notes } = this.data
    try {
      const response = await wx.cloud.callFunction({
        name: 'submitReservation',
        data: {
          checkInDate: date,
          nights,
          guestCount: guests,
          roomCount: rooms,
          name,
          wechatId: wechat,
          notes
        }
      })
      const result = response && response.result
      if (!result || !result.ok || !result.reservation) {
        throw new Error(result && result.error && result.error.message || '预约提交失败，请稍后重试')
      }
      const reservation = result.reservation
      const query = [
        ['reservationNumber', reservation.reservationNumber],
        ['createdAt', reservation.createdAt],
        ['checkInDate', reservation.checkInDate],
        ['checkOutDate', reservation.checkOutDate],
        ['nights', reservation.nights],
        ['guestCount', reservation.guestCount],
        ['roomCount', reservation.roomCount],
        ['name', reservation.name],
        ['discountAmountCents', reservation.discountAmountCents],
        ['status', reservation.status]
      ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
      this.setData({ reviewVisible: false, reviewConfirmed: true, submitting: false })
      wx.navigateTo({ url: `/pages/confirmation/index?${query}` })
    } catch (error) {
      const submitError = error && error.message || '预约提交失败，请稍后重试'
      this.setData({ reviewVisible: false, reviewConfirmed: false, submitting: false, submitError })
      if (wx.showToast) wx.showToast({ title: '提交失败，请检查后重试', icon: 'none' })
    }
  },
  noop() {}
})
