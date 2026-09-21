App({
  onLaunch() {
    if (!wx.cloud) throw new Error('当前微信基础库不支持云开发')
    wx.cloud.init({
      env: 'cloud1-d5g1dxxwj6b8f75fd',
      traceUser: true
    })
  }
})
