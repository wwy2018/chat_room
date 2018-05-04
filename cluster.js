const fork=require('child_process').fork
const cpunum=require('os').cpus().length
for (let i=0;i<cpunum;i++){
  fork('./server.js', [6001+i])
}