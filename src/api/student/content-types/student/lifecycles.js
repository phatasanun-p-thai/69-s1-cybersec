const md5 = require('md5')
module.exports = {
    async beforeCreate(event) {
        console.log('beforeCreate is work!', event.params.data)
        // event.params.data.mobile = 'yxz'
        event.params.data.mobile = md5(event.params.data.mobile)
    }
}