const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'cloudfunctions/submitReservation/index.js'), 'utf8')
const savedRecords = []
let saveShouldFail = false
let sendShouldFail = false
const sentMessages = []
const resendKeys = []
let page
let nowMs = Date.UTC(2028, 1, 26, 16)

class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [nowMs])) }
  static now() { return nowMs }
}

const cloud = {
  DYNAMIC_CURRENT_ENV: Symbol('dynamic-current-env'),
  init: () => {},
  database: () => ({
    collection: name => {
      assert.equal(name, 'reservations')
      return {
        add: async ({ data }) => {
          if (saveShouldFail) throw new Error('database unavailable')
          const record = { _id: `reservation-${savedRecords.length + 1}`, ...data }
          savedRecords.push(record)
          return { _id: record._id }
        },
        doc: id => ({
          update: async ({ data }) => {
            const record = savedRecords.find(item => item._id === id)
            assert.ok(record, `missing record ${id}`)
            Object.assign(record, data)
          }
        })
      }
    }
  })
}

const resend = {
  Resend: function (key) {
    resendKeys.push(key)
    return {
      emails: {
        send: async message => {
          sentMessages.push(message)
          if (sendShouldFail) {
            return { data: null, error: { name: 'validation_error', message: 'from domain is not verified' } }
          }
          return { data: { id: 'email-1' }, error: null }
        }
      }
    }
  }
}

const sandbox = {
  module: { exports: {} },
  exports: {},
  require: name => {
    if (name === 'wx-server-sdk') return cloud
    if (name === 'crypto') return { randomBytes: () => Buffer.from([0xab, 0xcd, 0x12, 0x34]) }
    if (name === 'resend') return resend
    throw new Error(`unexpected module: ${name}`)
  },
  Date: TestDate,
  process: {
    env: {
      RESEND_API_KEY: 're_test_key',
      RESERVATION_ADMIN_EMAIL: 'admin@example.test',
      RESEND_FROM_EMAIL: '预约通知 <notify@example.test>'
    }
  },
  console
}
sandbox.exports = sandbox.module.exports
vm.runInNewContext(`(function (exports, require, module) { ${source}\n})(exports, require, module)`, sandbox)
page = sandbox.module.exports

const valid = {
  checkInDate: '2028-02-28',
  nights: 2,
  guestCount: 3,
  roomCount: 2,
  name: '  测试访客  ',
  wechatId: '  test_wechat  ',
  notes: '  需要安静房间  '
}

async function main() {
  const result = await page.main(valid)
  assert.equal(result.ok, true)
  assert.equal(result.reservation.reservationNumber, 'AYV-280227-ABCD1234')
  assert.equal(result.reservation.checkOutDate, '2028-03-01')
  assert.equal(result.reservation.name, '测试访客')
  assert.equal(result.reservation.wechatId, 'test_wechat')
  assert.equal(result.reservation.notes, '需要安静房间')
  assert.equal(result.reservation.status, 'submitted')
  assert.equal(result.reservation.discountAmountCents, 10000)
  assert.equal(result.reservation.createdAt, '2028-02-26T16:00:00.000Z')
  assert.equal(savedRecords[0].reservationNumber, result.reservation.reservationNumber)
  assert.equal(savedRecords[0].checkOutDate, result.reservation.checkOutDate)
  assert.equal(savedRecords[0].createdAt.toISOString(), result.reservation.createdAt)
  assert.equal(savedRecords[0].notificationStatus, 'sent')
  assert.equal(savedRecords[0].notificationAttempts, 1)
  assert.equal(savedRecords[0].lastNotificationError, '')
  assert.deepEqual(resendKeys, ['re_test_key'])
  assert.equal(sentMessages.length, 1)
  assert.equal(sentMessages[0].from, '预约通知 <notify@example.test>')
  assert.equal(sentMessages[0].to.length, 1)
  assert.equal(sentMessages[0].to[0], 'admin@example.test')
  assert.match(sentMessages[0].text, /状态：待人工联系确认/)
  assert.match(sentMessages[0].text, new RegExp(result.reservation.reservationNumber))
  assert.match(sentMessages[0].text, /入住日期：2028-02-28/)
  assert.match(sentMessages[0].text, /人数：3/)
  assert.match(sentMessages[0].text, /房间数：2/)
  assert.match(sentMessages[0].text, /姓名：测试访客/)
  assert.match(sentMessages[0].text, /微信号：test_wechat/)
  assert.match(sentMessages[0].text, /备注：需要安静房间/)

  const invalidCases = [
    { field: 'checkInDate', value: '2028-02-27' },
    { field: 'checkInDate', value: '2028-02-30' },
    { field: 'nights', value: 3 },
    { field: 'guestCount', value: 0 },
    { field: 'guestCount', value: 1.5 },
    { field: 'roomCount', value: 0 },
    { field: 'roomCount', value: 1, extra: { guestCount: 3 } },
    { field: 'name', value: '   ' },
    { field: 'wechatId', value: '' }
  ]
  for (const testCase of invalidCases) {
    const response = await page.main({ ...valid, ...testCase.extra, [testCase.field]: testCase.value })
    assert.equal(response.ok, false, testCase.field)
    assert.equal(response.error.code, 'INVALID_RESERVATION', testCase.field)
  }
  assert.equal(savedRecords.length, 1)

  sendShouldFail = true
  const notificationFailed = await page.main(valid)
  assert.equal(notificationFailed.ok, true)
  assert.equal(savedRecords[1].notificationStatus, 'failed')
  assert.equal(savedRecords[1].notificationAttempts, 1)
  assert.match(savedRecords[1].lastNotificationError, /from domain is not verified/)
  assert.equal(savedRecords.length, 2)

  saveShouldFail = true
  const failed = await page.main(valid)
  assert.equal(failed.ok, false)
  assert.equal(failed.error.code, 'SAVE_FAILED')
  assert.equal(savedRecords.length, 2)

  console.log('PASS: 服务端校验、保存、预约编号、Resend 邮件通知内容、通知成功/失败状态与保存失败边界')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
