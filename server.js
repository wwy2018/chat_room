var express=require('express')
var app=express()
var server=require('http').createServer(app)
var io=require('socket.io')(server)
var path=require('path')
app.use(express.static(path.join(__dirname, 'public')))
const port=Number(process.argv[2] || 6001)
server.listen(port)

io.on('connection', function (socket){
  socket.on('newmsg', function (data){
    console.log(data)
    socket.broadcast.emit('broadmsg', data)
  })
})