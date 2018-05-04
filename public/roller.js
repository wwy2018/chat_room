(function(){
  // const reg = /\{\{((?:.|\n)+?)\}\}/g
  var Util = {
    isComment: function (node) {
      return node.nodeType === 8
    },
    isText: function (node) {
      return node.nodeType === 3
    },
    isElement: function (node) {
      return node.nodeType === 1
    },
    isObjet: function (obj) {
      return typeof obj !== null && typeof obj === 'object'
    },
    isEqual: function (a, b) {
      return a === b || this.isObjet(a) && this.isObjet(b) ? JSON.stringify(a) === JSON.stringify(b) : false
    },
    deepCopy: function (from) {
      var r
      if (this.isObjet(from)) {
        r = JSON.parse(JSON.stringify(from))
      } else {
        r = from
      }
      return r
    },
    toFragment: function (nodes) {
      const frag = document.createDocumentFragment()
      nodes.forEach(node => {
        if (!this.isComment(node)) {
          frag.appendChild(node)
        }
      })
      return frag
    },
    parseText: function (text) {
      var regText = /\{\{(.+?)\}\}/g;
      var pieces = text.split(regText);
      var matches = text.match(regText);
      // 文本节点转化为常量和变量的组合表达式，PS：表达式中的空格不管，其他空格要保留
      // 'a {{b+"text"}} c {{d+Math.PI}}' => '"a " + b + "text" + " c" + d + Math.PI'
      var tokens = [];
      pieces.forEach(function (piece) {
        if (matches && matches.indexOf('{{' + piece + '}}') > -1) {    // 注意排除无{{}}的情况
          tokens.push(piece);
        } else if (piece) {
          tokens.push('`' + piece + '`');
        }
      });
      return tokens.join('+');
    }
  }
  var $uid = 0
  function Watcher (exp, scope, cb) {
    this.exp = exp
    this.scope = scope
    this.cb = cb || function () {}
    this.value = null
    this.uid = $uid++
    this.update()
  }
  Watcher.prototype = {
    get: function () {
      Dep.target = this
      const value = computeExp(this.exp, this.scope)
      Dep.target = null
      return value
    },
    update: function (options) {
      var newVal = this.get()
      if (!Util.isEqual(this.value, newVal)) {
        this.cb && this.cb(newVal, this.value, options)
        this.value = Util.deepCopy(newVal)
      }
    }
  }
  function computeExp(exp, scope) {
    try {
      with (scope) {
        return eval(exp)
      }
    } catch (e) {
      console.error(e)
    }
  }
  function Dep () {
    this.subs = {}
  }
  Dep.prototype = {
    addSub: function (target) {
      if (!this.subs[target.uid]) {
        this.subs[target.uid] = target
      }
    },
    notify: function (options) {
      for (let uid in this.subs) {
        this.subs[uid].update(options)
      }
    }
  }
  function Observer(data) {
		this.data = data;
		this.observe(data);
	}

	Observer.prototype = {

		// 监视主控函数
		observe: function (data) {
			var self = this;
			// 设置开始和递归终止条件
			if (!data || typeof data !== 'object') {
				return;
			}
			Object.keys(data).forEach(function (key) {
				self.observeObject(data, key, data[key]);
			});
		},

		// 监视对象，劫持Obect的getter、setter实现
		observeObject: function (data, key, val) {
			var dep = new Dep();   // 每个变量单独一个dependence列表
			var self = this;
			Object.defineProperty(data, key, {
				enumerable  : true,    // 枚举
				configurable: false,   // 不可再配置
				get         : function () {
					console.log('o get')
					// 由于需要在闭包内添加watcher，所以通过Dep定义一个全局target属性，暂存watcher, 添加完移除
					Dep.target && dep.addSub(Dep.target);
					return val;
				},
				set         : function (newVal) {
					console.log('o set')
					if (val === newVal) {
						return;
					}
					val = newVal;  // setter本身已经做了赋值，val作为一个闭包变量，保存最新值
					if (Array.isArray(newVal)) {
						self.observeArray(newVal, dep);  // 递归监视，数组的监视要分开
					} else {
						self.observe(newVal);   // 递归对象属性到基本类型为止
					}
					dep.notify();  // 触发通知
				},
			});
			if (Array.isArray(val)) {
				self.observeArray(val, dep);  // 递归监视，数组的监视要分开
			} else {
				self.observe(val);   // 递归对象属性到基本类型为止
			}
		},

		// 监视数组
		observeArray: function (arr, dep) {
			var self = this;
			arr.__proto__ = self.defineReactiveArray(dep);
			arr.forEach(function (item) {
				self.observe(item);
			});
		},

		// 改写Array的原型实现数组监视
		defineReactiveArray: function (dep) {
			var arrayPrototype = Array.prototype;
			var arrayMethods = Object.create(arrayPrototype);
			var self = this;

			// 重写/定义数组变异方法
			var methods = [
				'pop',
				'push',
				'sort',
				'shift',
				'splice',
				'unshift',
				'reverse'
			];

			methods.forEach(function (method) {
				// 得到单个方法的原型对象，不能直接修改整个Array原型，那是覆盖
				var original = arrayPrototype[method];
				// 给数组方法的原型添加监监视
				Object.defineProperty(arrayMethods, method, {
					value       : function () {
						// 获取函数参数
						var args = [];
						for (var i = 0, l = arguments.length; i < l; i++) {
							args.push(arguments[i]);
						}
						// 数组方法的实现
						var result = original.apply(this, args);
						// 数组插入项
						var inserted
						switch (method) {
							case 'push':
							case 'unshift':
								inserted = args
								break
							case 'splice':
								inserted = args.slice(2)
								break
						}
						// 监视数组插入项，而不是重新监视整个数组
						if (inserted && inserted.length) {
							self.observeArray(inserted, dep)
						}
						// 触发更新
						dep.notify({method, args});
						return result
					},
					enumerable  : true,
					writable    : true,
					configurable: true
				});
			});

			/**
			 * 添加数组选项设置/替换方法（全局修改）
			 * 提供需要修改的数组项下标 index 和新值 value
			 */
			Object.defineProperty(arrayMethods, '$set', {
				value: function (index, value) {
					// 超出数组长度默认追加到最后
					if (index >= this.length) {
						index = this.length;
					}
					return this.splice(index, 1, value)[0];
				}
			});

			/**
			 * 添加数组选项删除方法（全局修改）
			 */
			Object.defineProperty(arrayMethods, '$remove', {
				value: function (item) {
					var index = this.indexOf(item);
					if (index > -1) {
						return this.splice(index, 1);
					}
				}
			});


			return arrayMethods;
		}

	};
  // function Observer (data) {
  //   this.data = data
  //   for (let k in data) {
  //     this.observe(data, k, data[k])
  //   }
  // }
  // Observer.prototype = {
  //   observe: function (data, key, val) {
  //     let dep = new Dep()
  //     Object.defineProperty(data, key, {
  //       enumerable: true,
  //       configurable: false,
  //       get: function () {
  //         Dep.target && dep.addSub(Dep.target)
  //         return val
  //       },
  //       set: function (newVal) {
  //         console.log('set')
  //         if (val === newVal) return
  //         dep.notify()
  //       }
  //     })
  //   }
  // }
  
  function Compiler (options) {
    const node = options.el
    const nodes = [].slice.call(node.childNodes)
    const frag = Util.toFragment(nodes)
    this.scope = options.scope
    this.compile(frag, this.scope)
    node.appendChild(frag)
  }
  Compiler.prototype = {
    compile: function (nodes, scope) {
      const childs = [].slice.call(nodes.childNodes)
      childs.forEach(child => {
        if (Util.isText(child)) {
          const text = child.textContent.trim()
          if (text) {
            const parText = Util.parseText(text)
            this.textHandler(parText, scope, child)
          }
        } else if (Util.isElement(child)) {
          const attrs = [].slice.call(child.attributes)
          if (attrs.length) {
            attrs.forEach(attr => {
              const attrName = attr.name
              const attrVal = attr.value
              if (attrName === 'r-if') {
                const commentNode = document.createComment('')
                const parent = child.parentNode
                parent.insertBefore(commentNode, child)
                parent.removeChild(child)
                this.ifHandler(attrVal, scope, commentNode, child, parent)
              } else if (attrName === 'r-for') {
                this.forHandler(attrVal, scope, child)
              } else if (attrName.indexOf('@') > -1) {
                var methodsHandler = this.methodsHandler.bind(this)
                methodsHandler(child, attrVal, scope)
                this.compile(child, scope)
              }
            })
          } else {
            this.compile(child, scope)
          }
        }
      })
    },
    methodsHandler: function (node, exp, scope) {
      let fn = scope[exp]
      node.addEventListener('click', fn.bind(scope))
    },
    forHandler: function (attrVal, data, node) {
      const exp = attrVal.split(' in ')[1].replace(/\s+/g, '')
      const itemName = attrVal.split(' in ')[0].split(',')[0].replace(/(\(|\()/g, '')
      const parentNode = node.parentNode
      const startNode = document.createComment('')
      const endNode = document.createComment('')
      const range = document.createRange()
      parentNode.replaceChild(endNode, node)
      parentNode.insertBefore(startNode, endNode)
      range.setStart(startNode, 0)
      range.setEnd(endNode, 0)
      range.deleteContents()
      new Watcher(exp, data, (value) => {
        value.map((item, index) => {
          const newNode = node.cloneNode(true)
          parentNode.insertBefore(newNode, endNode)
          const forScope = Object.create(data)
          forScope[itemName] = item
          this.compile(newNode, forScope)
        })
      })
    },
    ifHandler: function (exp, data, commentNode, node, parent) {
      new Watcher(exp, data, (value) => {
        if (value) {
          parent.insertBefore(node, commentNode)
          console.log(node)
          this.compile(node, data)
        } else {
          if (parent.contains(node)) {
            parent.removeChild(node)
          }
        }
      })
    },
    textHandler: function (exp, data, node) {
      new Watcher(exp, data, (value) => {
        node.textContent = value
      })
    }
  }
  
  function Roller (options) {
    this.data = Object.assign({}, options.data)
    this.node = document.querySelector(options.el)
    this.methods = Object.assign({}, options.methods)
    this._proxy(this.data)
    this._proxymethod(this.methods)
    const ob = new Observer(this.data)
    new Compiler({el: this.node, scope: this})
  }
  Roller.prototype = {
    _proxy: function (data) {
      for (let k in data) {
        Object.defineProperty(this, k, {
          configurable: false,
          enumerable: true,
          get: () => {
            return data[k]
          },
          set: (val) => {
            this.data[k] = val
          }
        })
      }
    },
    _proxymethod: function (methods) {
      for (let k in methods) {
        this[k] = methods[k]
      }
    }
  }
  window.Roller = Roller
})()