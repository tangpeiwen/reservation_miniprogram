// 本轮仅使用页面内存展示 UI，不调用后端或写入本地存储。
function dateInfo(value, nights) {
  const [year, month, day] = value.split('-').map(Number)
  const end = new Date(year, month - 1, day + nights)
  return {
    dateLabel: `${year}年${month}月${day}日`,
    stayLabel: `${month}月${day}日入住 → ${end.getMonth() + 1}月${end.getDate()}日离店`
  }
}
function monthInfo(year, month) {
  const first = new Date(year, month - 1, 1)
  const y = first.getFullYear(), m = first.getMonth() + 1
  const count = new Date(y, m, 0).getDate()
  const calendarDays = Array.from({ length: first.getDay() }, (_, i) => ({ key: 'blank-' + i }))
  for (let day = 1; day <= count; day++) {
    const value = [y, String(m).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
    calendarDays.push({ key: value, value, day })
  }
  return { calendarYear: y, calendarMonth: m, calendarDays }
}
Page({
  data: {
    date: '', dateConfirmed: false, nights: 2, guests: 2, rooms: 1,
    name: '', wechat: '', notes: '', reviewVisible: false,
    calendarVisible: false, pendingDate: '', pendingDateLabel: '', calendarDays: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    dateLabel: '', stayLabel: ''
  },
  onLoad() {
    // 以北京时间当天初始化；返回弹层不重置用户已选日期。
    const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
    const date = [now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, '0'), String(now.getUTCDate()).padStart(2, '0')].join('-')
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
    this.setData({ pendingDate, pendingDateLabel: dateInfo(pendingDate, this.data.nights).dateLabel })
  },
  confirmDate() {
    const date = this.data.pendingDate
    this.setData({ date, dateConfirmed: true, calendarVisible: false, ...dateInfo(date, this.data.nights) })
  },
  changeNights(event) {
    const nights = Number(event.currentTarget.dataset.value)
    this.setData({ nights, ...dateInfo(this.data.date, nights) })
  },
  step(event) {
    const { field, delta } = event.currentTarget.dataset
    this.setData({ [field]: Math.max(1, this.data[field] + Number(delta)) })
  },
  input(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value })
  },
  openReview() { this.setData({ reviewVisible: true }) },
  closeReview() { this.setData({ reviewVisible: false }) },
  noop() {}
})
