const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
let page
let navigateOptions
let scrollOptions
let callOptions
let toastOptions
let shareMenuOptions
let submitShouldFail = false
let nowMs = Date.UTC(2028, 1, 26, 16)

class TestDate extends Date {
  static now() { return nowMs }
}

vm.runInNewContext(fs.readFileSync(path.join(root, 'miniprogram/pages/reservation/index.js'), 'utf8'), {
  Page: value => { page = value },
  Date: TestDate,
  wx: {
    cloud: {
      callFunction: async options => {
        callOptions = options
        if (submitShouldFail) return { result: { ok: false, error: { message: '服务端拒绝测试预约' } } }
        return {
          result: {
            ok: true,
            reservation: {
              reservationNumber: 'reservation-001',
              createdAt: '2028-02-26T16:00:00.000Z',
              checkInDate: '2028-02-28',
              checkOutDate: '2028-02-29',
              nights: 1,
              guestCount: 3,
              roomCount: 2,
              name: '测试访客',
              discountAmountCents: 10000,
              status: 'submitted'
            }
          }
        }
      }
    },
    navigateTo: options => { navigateOptions = options },
    pageScrollTo: options => { scrollOptions = options },
    showShareMenu: options => { shareMenuOptions = options },
    showToast: options => { toastOptions = options }
  }
})

page.setData = patch => Object.assign(page.data, patch)
const actionEvent = dataset => ({ currentTarget: { dataset } })
const inputEvent = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } })

async function main() {
  page.onLoad()
  assert.deepEqual(JSON.parse(JSON.stringify(shareMenuOptions.menus)), ['shareAppMessage', 'shareTimeline'])
  assert.deepEqual(JSON.parse(JSON.stringify(page.onShareAppMessage())), {
    title: 'NE群 × 阿育吠陀体验预约',
    path: '/pages/reservation/index',
    imageUrl: '/assets/cat-display.png'
  })
  assert.deepEqual(JSON.parse(JSON.stringify(page.onShareTimeline())), {
    title: 'NE群 × 阿育吠陀体验预约',
    query: '',
    imageUrl: '/assets/cat-display.png'
  })
  const initialDate = page.data.date
  page.openCalendar()
  const initialLabel = page.data.pendingDateLabel
  assert.equal(initialDate, '2028-02-27')
  assert.equal(page.data.calendarDays.find(day => day.value === initialDate).disabled, true)
  page.selectDay(actionEvent({ date: '2028-02-26' }))
  assert.equal(page.data.pendingDate, initialDate)
  page.changeMonth(actionEvent({ delta: 1 }))
  assert.equal(page.data.pendingDate, initialDate)
  assert.equal(page.data.pendingDateLabel, initialLabel)
  page.selectDay(actionEvent({ date: '2028-02-28' }))
  assert.equal(page.data.pendingDateLabel, '2028年2月28日')
  page.closeCalendar()
  assert.equal(page.data.date, initialDate)
  assert.equal(page.data.dateConfirmed, false)
  page.openCalendar()
  page.selectDay(actionEvent({ date: '2028-02-28' }))
  page.confirmDate()
  assert.equal(page.data.dateLabel, '2028年2月28日')
  assert.equal(page.data.stayLabel, '2月28日入住 → 3月1日离店')
  page.changeNights(actionEvent({ value: 1 }))
  assert.equal(page.data.stayLabel, '2月28日入住 → 2月29日离店')
  page.changeNights(actionEvent({ value: 3 }))
  assert.equal(page.data.nights, 1)
  page.step(actionEvent({ field: 'guests', delta: 1 }))
  assert.equal(page.data.capacityError, '房间数不足，每间最多入住 2 人')
  page.step(actionEvent({ field: 'rooms', delta: 1 }))
  assert.equal(page.data.capacityError, '')

  page.openReview()
  assert.equal(page.data.reviewVisible, false)
  assert.equal(page.data.nameError, '请填写名字')
  assert.equal(page.data.wechatError, '请填写微信号')
  assert.equal(page.data.focusField, 'name')
  page.input(inputEvent('name', '测'))
  assert.equal(page.data.focusField, 'name')
  page.blurInput(inputEvent('name', '测'))
  assert.equal(page.data.focusField, '')
  page.input(inputEvent('name', '  测试访客  '))
  page.openReview()
  assert.equal(page.data.focusField, 'wechat')
  page.input(inputEvent('wechat', 't'))
  assert.equal(page.data.focusField, 'wechat')
  page.input(inputEvent('wechat', '  test_wechat  '))
  page.input(inputEvent('notes', '需要安静房间'))
  page.step(actionEvent({ field: 'rooms', delta: -1 }))
  page.openReview()
  assert.equal(page.data.reviewVisible, false)
  assert.equal(scrollOptions.selector, '.capacity-error')
  page.step(actionEvent({ field: 'rooms', delta: 1 }))
  page.openReview()
  await page.confirmReview()

  assert.equal(callOptions.name, 'submitReservation')
  assert.deepEqual(JSON.parse(JSON.stringify(callOptions.data)), {
    checkInDate: '2028-02-28', nights: 1, guestCount: 3, roomCount: 2,
    name: '测试访客', wechatId: 'test_wechat', notes: '需要安静房间'
  })
  const [voucherPath, voucherQuery] = navigateOptions.url.split('?')
  assert.equal(voucherPath, '/pages/confirmation/index')
  const voucherParams = new URLSearchParams(voucherQuery)
  assert.equal(voucherParams.get('reservationNumber'), 'reservation-001')
  assert.equal(voucherParams.get('checkOutDate'), '2028-02-29')
  assert.equal(voucherParams.get('createdAt'), '2028-02-26T16:00:00.000Z')
  assert.equal(page.data.name, '测试访客')
  assert.equal(page.data.wechat, 'test_wechat')

  submitShouldFail = true
  navigateOptions = undefined
  page.input(inputEvent('notes', '失败后仍保留'))
  page.openReview()
  await page.confirmReview()
  assert.equal(navigateOptions, undefined)
  assert.equal(page.data.reviewVisible, false)
  assert.equal(page.data.submitting, false)
  assert.equal(page.data.submitError, '服务端拒绝测试预约')
  assert.equal(page.data.notes, '失败后仍保留')
  assert.equal(toastOptions.title, '提交失败，请检查后重试')

  nowMs = Date.UTC(2028, 1, 27, 16)
  page.openReview()
  assert.equal(page.data.reviewVisible, false)
  assert.equal(page.data.dateConfirmed, false)
  assert.equal(page.data.dateError, '请选择明天或之后的日期')

  const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/reservation/index.wxml'), 'utf8')
  assert(wxml.includes('保存成功才会生成正式凭证'))
  assert(wxml.includes("{{submitting ? '正在提交…' : '确认并提交'}}"))
  assert(wxml.includes('{{submitError}}'))
  assert(wxml.includes('disabled="{{item.disabled}}"'))
  assert(wxml.includes('maxlength="40"'))
  assert(wxml.includes('maxlength="80"'))
  assert(wxml.includes('maxlength="500"'))
  for (const [, handler] of wxml.matchAll(/(?:bind\w+|catch\w+)="(\w+)"/g)) assert.equal(typeof page[handler], 'function', handler)
  const luminance = hex => hex.match(/\w\w/g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
  for (const background of ['ffffff', 'f0f8fc', 'edf7ff']) assert((luminance(background) + .05) / (luminance('606b7d') + .05) >= 4.5)
  console.log('PASS: 分享入口、前端校验、真实提交、服务端凭证参数、失败留表单与输入保留、跨午夜、事件绑定与灰字对比度')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
