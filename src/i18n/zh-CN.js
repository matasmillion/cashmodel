// Simplified Chinese dictionary. Keys must mirror en.js exactly — the
// useT() hook falls back to English on missing keys, but missing keys
// should be treated as bugs, not fallbacks.

const zhCN = {
  locale: {
    name: '简体中文',
    short: '中文',
  },
  vendor: {
    common: {
      brand: 'Foreign Resource',
      portal: '供应商门户',
      signOut: '退出登录',
      language: '语言',
      loading: '加载中…',
      empty: '暂无内容。',
      back: '返回',
      acknowledge: '确认接收',
      acknowledged: '已确认',
      pending: '待处理',
      open: '进行中',
      submitted: '已提交',
      received: '已收货',
      shipped: '已发货',
      cancelled: '已取消',
      contact: '如有疑问,请联系您的客户经理。',
    },
    auth: {
      signInTitle: '登录供应商门户',
      signInSubtitle: '请使用客户经理邀请的邮箱登录。',
      signUpTitle: '创建供应商账户',
      signUpSubtitle: '请使用收到邀请的邮箱注册。未受邀请的注册将被拒绝。',
      noAccess: '您的账户尚未绑定供应商资料,请联系您的客户经理。',
    },
    dashboard: {
      title: '工作台',
      greeting: '欢迎回来',
      newPOs: '新订单',
      newSamples: '样品需求',
      openItems: '进行中事项',
      seeAllPOs: '查看全部订单',
      seeAllSamples: '查看全部样品需求',
    },
    po: {
      title: '采购订单',
      number: '订单号',
      style: '款式',
      units: '数量',
      placedAt: '下单时间',
      due: '交期',
      status: {
        draft: '草稿',
        placed: '已下单',
        in_production: '生产中',
        received: '已收货',
        closed: '已结案',
        cancelled: '已取消',
      },
      detail: {
        sizeBreak: '尺码分配',
        notes: '生产备注',
        ack: '确认此订单',
        ackHint: '确认后,您的客户经理会收到通知,表示您已开始生产。',
      },
    },
    sample: {
      title: '样品需求',
      type: '类型',
      style: '款式',
      requestedAt: '申请时间',
      verdict: {
        Pending: '待确认',
        Approved: '已通过',
        Rejected: '未通过',
        Resubmit: '需重做',
      },
      detail: {
        courier: '快递',
        tracking: '运单号',
        notes: '备注',
      },
    },
    account: {
      title: '账户中心',
      profile: '个人资料',
      preferences: '偏好设置',
      languagePref: '语言偏好',
      languagePrefHint: '门户页面与邮件均会使用此语言。',
    },
    notify: {
      newPOSubject: '来自 Foreign Resource 的新采购订单',
      newPOBody: '供应商门户中有一份新的采购订单等待您处理。',
      newSampleSubject: '来自 Foreign Resource 的新样品需求',
      newSampleBody: '供应商门户中有一份新的样品需求等待您处理。',
      cta: '打开供应商门户',
    },
  },
};

export default zhCN;
