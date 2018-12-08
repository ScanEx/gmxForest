var gmxForest = (function (exports) {
	'use strict';

	function noop() {}

	function assign(tar, src) {
		for (var k in src) { tar[k] = src[k]; }
		return tar;
	}

	function assignTrue(tar, src) {
		for (var k in src) { tar[k] = 1; }
		return tar;
	}

	function callAfter(fn, i) {
		if (i === 0) { fn(); }
		return function () {
			if (!--i) { fn(); }
		};
	}

	function run(fn) {
		fn();
	}

	function append(target, node) {
		target.appendChild(node);
	}

	function insert(target, node, anchor) {
		target.insertBefore(node, anchor);
	}

	function detachNode(node) {
		node.parentNode.removeChild(node);
	}

	function destroyEach(iterations, detach) {
		for (var i = 0; i < iterations.length; i += 1) {
			if (iterations[i]) { iterations[i].d(detach); }
		}
	}

	function createElement(name) {
		return document.createElement(name);
	}

	function createText(data) {
		return document.createTextNode(data);
	}

	function createComment() {
		return document.createComment('');
	}

	function addListener(node, event, handler, options) {
		node.addEventListener(event, handler, options);
	}

	function removeListener(node, event, handler, options) {
		node.removeEventListener(event, handler, options);
	}

	function setAttribute(node, attribute, value) {
		if (value == null) { node.removeAttribute(attribute); }
		else { node.setAttribute(attribute, value); }
	}

	function setData(text, data) {
		text.data = '' + data;
	}

	function blankObject() {
		return Object.create(null);
	}

	function destroy(detach) {
		this.destroy = noop;
		this.fire('destroy');
		this.set = noop;

		this._fragment.d(detach !== false);
		this._fragment = null;
		this._state = {};
	}

	function _differs(a, b) {
		return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
	}

	function fire(eventName, data) {
		var handlers =
			eventName in this._handlers && this._handlers[eventName].slice();
		if (!handlers) { return; }

		for (var i = 0; i < handlers.length; i += 1) {
			var handler = handlers[i];

			if (!handler.__calling) {
				try {
					handler.__calling = true;
					handler.call(this, data);
				} finally {
					handler.__calling = false;
				}
			}
		}
	}

	function flush(component) {
		component._lock = true;
		callAll(component._beforecreate);
		callAll(component._oncreate);
		callAll(component._aftercreate);
		component._lock = false;
	}

	function get() {
		return this._state;
	}

	function init(component, options) {
		component._handlers = blankObject();
		component._slots = blankObject();
		component._bind = options._bind;
		component._staged = {};

		component.options = options;
		component.root = options.root || component;
		component.store = options.store || component.root.store;

		if (!options.root) {
			component._beforecreate = [];
			component._oncreate = [];
			component._aftercreate = [];
		}
	}

	function on(eventName, handler) {
		var handlers = this._handlers[eventName] || (this._handlers[eventName] = []);
		handlers.push(handler);

		return {
			cancel: function() {
				var index = handlers.indexOf(handler);
				if (~index) { handlers.splice(index, 1); }
			}
		};
	}

	function set(newState) {
		this._set(assign({}, newState));
		if (this.root._lock) { return; }
		flush(this.root);
	}

	function _set(newState) {
		var oldState = this._state,
			changed = {},
			dirty = false;

		newState = assign(this._staged, newState);
		this._staged = {};

		for (var key in newState) {
			if (this._differs(newState[key], oldState[key])) { changed[key] = dirty = true; }
		}
		if (!dirty) { return; }

		this._state = assign(assign({}, oldState), newState);
		this._recompute(changed, this._state);
		if (this._bind) { this._bind(changed, this._state); }

		if (this._fragment) {
			this.fire("state", { changed: changed, current: this._state, previous: oldState });
			this._fragment.p(changed, this._state);
			this.fire("update", { changed: changed, current: this._state, previous: oldState });
		}
	}

	function _stage(newState) {
		assign(this._staged, newState);
	}

	function callAll(fns) {
		while (fns && fns.length) { fns.shift()(); }
	}

	function _mount(target, anchor) {
		this._fragment[this._fragment.i ? 'i' : 'm'](target, anchor || null);
	}

	var proto = {
		destroy: destroy,
		get: get,
		fire: fire,
		on: on,
		set: set,
		_recompute: noop,
		_set: _set,
		_stage: _stage,
		_mount: _mount,
		_differs: _differs
	};

	var serverBase = window.serverBase || '//maps.kosmosnimki.ru/';

	var chkTask = function (id) {
		var UPDATE_INTERVAL = 2000;
		return new Promise(function (resolve, reject) {
			var interval = setInterval(function () {
				fetch((serverBase + "AsyncTask.ashx?WrapStyle=None&TaskID=" + id),
				{
					mode: 'cors',
					credentials: 'include'
				})
					.then(function (res) { return res.json(); })
					.then(function (json) {
						var ref = json.Result;
						var Completed = ref.Completed;
						var ErrorInfo = ref.ErrorInfo;
						if (ErrorInfo) {
							clearInterval(interval);
							reject(json);
						} else if (Completed) {
							clearInterval(interval);
							resolve(json);
						}
					})
					.catch(function (err) { return console.warn(err); });
			}, UPDATE_INTERVAL);
		});
	};

	var modifyVectorObjects = function (layerId, features) {
		console.log('modifyVectorObjects ____ ', layerId, features);
		var params = {
			WrapStyle: 'None',
			LayerName : layerId,
			Objects: JSON.stringify(features)
		};

		return fetch((serverBase + "VectorLayer/ModifyVectorObjects.ashx?" + (L.gmxUtil.getFormData(params))), {
			mode: 'cors',
			credentials: 'include',
			headers: {
				'Accept': 'application/json'
			}
		})
			.then(function (res) { return res.json(); })
			.catch(function (err) { return console.warn(err); });
	};

	var getReportsCount = function () {
		return fetch((serverBase + "plugins/forestreport/rest/GetCurrentUserInfo?WrapStyle=None"), {
				mode: 'cors',
				credentials: 'include'
			})
			.then(function (res) { return res.json(); })
			.catch(function (err) { return console.warn(err); });
	};

	var loadFeatures = function (id) {
		return fetch((serverBase + "VectorLayer/Search.ashx?layer=" + id + "&geometry=true&out_cs=EPSG:4326&WrapStyle=None"), {
				mode: 'cors',
				credentials: 'include'
			})
			.then(function (res) { return res.json(); })
			.catch(function (err) { return console.warn(err); });
	};

	var selectFeaturesWithDrawing = function (id, geometry) {
		var params = {
			WrapStyle: 'None',
			layer: id,
			columns: '[{"Value":"[gmx_id]"}]',
			page: 0,
			// pagesize: null,
			query: ("STIntersects([gmx_geometry], GeometryFromGeoJson('" + (JSON.stringify(geometry)) + "', 4326))")
		};

		return fetch((serverBase + "VectorLayer/Search.ashx?" + (L.gmxUtil.getFormData(params))), {
			mode: 'cors',
			credentials: 'include',
			headers: {
				'Accept': 'application/json'
			}
		})
		.then(function (res) { return res.json(); })
		.then(function (json) {
			if (json.Status === 'ok' && json.Result) {
				return json.Result.values.reduce(function (a, v) {
					a[v] = true;
					return a;
				}, {});
			}
		})
		.catch(function (err) { return console.warn(err); })
	};

	var getLayersParams = function (gmxMap) {
		var satLayers = [];

		gmxMap.layers.forEach(function (it) {
			if (it.getGmxProperties && it._map) {
				var props = it.getGmxProperties(),
					metaProps = props.MetaProperties || {},
					out = {layerId: props.name, type: 'оптическая'};
				if (props.Temporal) {
					var dt = it.getDateInterval();
					if (dt.beginDate) { out.beginDate = dt.beginDate.getTime()/1000; }
					if (dt.endDate) { out.endDate = dt.endDate.getTime()/1000; }
				}
				if (metaProps.type) {
					out.type = metaProps.type.Value;
				}
				if (metaProps.system) {
					out.system = metaProps.system.Value;
				}
				if (metaProps.resolution) {
					out.resolution = metaProps.resolution.Value;
				}
				satLayers.push(out);
			}
		});
		return satLayers;
	};

	var getLayersIds = function (meta, gmxMap) {
		var layerIds = [], quadrantIds = [], limit = 0;

		gmxMap.layers.forEach(function (it) {
			if (it.getGmxProperties) {
				var props = it.getGmxProperties(),
					metaProps = props.MetaProperties || {};
				if (
					props.type.toLowerCase() === 'vector' &&
					props.GeometryType.toLowerCase() === 'polygon' &&
					!props.IsRasterCatalog &&
					!props.Quicklook
					) {
					var hash = {id: props.name, title: props.title};
					if (meta) {
						if (metaProps.forest && metaProps.forest.Value === 'true') {
							layerIds.push(hash);
						}
						if (metaProps.quadrant && metaProps.quadrant.Value === 'true') {
							quadrantIds.push(hash);
						}
					} else {
						layerIds.push(hash);
						quadrantIds.push(hash);
					}
				}
			}
		});

		return getReportsCount().then(function (json) {
			if (json.Status === 'ok') {
				var count = json.Result.limit - json.Result.used;
				limit = count > 0 ? count : 0;
			}
			return {layerIds: layerIds, quadrantIds: quadrantIds, limit: limit, cols: []};
		});
	};

	var saveState = function (data) {
		window.localStorage.setItem('gmxForest_', JSON.stringify(data));
	};

	var getState = function () {
		return JSON.parse(window.localStorage.getItem('gmxForest_')) || {};
	};

	var sendReport = function (checked, layerItems, hashCols, params, format, layerID, gmxMap, changedParams) {
		var groupRequest = [],
			features = [],
			satLayers = getLayersParams(gmxMap);

		layerItems.forEach(function (it) {
			var id = it[hashCols.gmx_id];
			if (checked[id]) {
				var data = {featureID: id};
				for (var key in params) {
					var val = params[key];
					var par = changedParams[key] || {};
					data[key] = typeof(par) === 'string' ? par : par.field ? it[hashCols[par.field]] : par.value || val.value;
				}
				data.satLayers = satLayers;
				groupRequest.push(data);
				features.push({action:'update', id:id, properties:{FRSTAT:2}});
			}
		});
		return fetch((serverBase + "Plugins/ForestReport/ForestReportImage"), {
				method: 'post',
				headers: {'Content-type': 'application/x-www-form-urlencoded'},
				body: L.gmxUtil.getFormData({WrapStyle: 'None', format: format, groupRequest: groupRequest}),
				mode: 'cors',
				credentials: 'include'
			})
			.then(function (res) { return res.json(); })
			.then(function (json) {
				if (json.Status === 'ok') {
					saveState(changedParams);
					return chkTask(json.Result.TaskID)
						.then(function (json) {
							if (json.Status === 'ok') {
								var downloadFile = json.Result.Result.downloadFile;

								window.open(serverBase + downloadFile, '_self');

								modifyVectorObjects(layerID, features);
								return {report: false};
							}
						})
						.catch(function (err) { return console.warn(err); });
				}
			})
			.catch(function (err) { return console.warn(err); });
	};

	/* src\Table.html generated by Svelte v2.15.3 */

	function data() {
		return {
			sortType: 'desc',	// 'asc'
			sortKey: 'gmx_id',	// 'FRSTAT'
			reverse: false,
			pageCurr: 1,
			pagesize: 15,
			pageFrom: 0,
			tableItems: [],
			items: [],
			// checked: {},
			hashCols: []
		};
	}
	var methods = {
		sort: function sort(key) {
			var ref = this.get();
			var sortType = ref.sortType;
			// console.log('sort', sortType);
			this.set({sortType: sortType === 'desc' ? 'asc' : 'desc', sortKey: key});
			this.setCurrPage(1);
		},
		checkReverse: function checkReverse(ev) {
			// console.log('checkReverse', ev.ctrlKey);

			var nChecked = {};
			var ctrlKey = ev.ctrlKey;
			var isChecked = ev.target.checked;
			
			if (ctrlKey || isChecked) {
				var ref = this.get();
				var items = ref.items;
				var hashCols = ref.hashCols;
				var checked = ref.checked;
				var nm = hashCols.gmx_id;
				items.forEach(function (it) {
					var id = it[nm];
					if (!ctrlKey || !checked[id]) {
						nChecked[id] = true;
					}
				});
			}
			this.set({checked: nChecked});
			// this.root.set({checked: nChecked});
		},
		checkMe: function checkMe(id) {
			// console.log('checkMe', id);
			var ref = this.get();
			var checked = ref.checked;
			if (checked[id]) {
				delete checked[id];
			} else {
				checked[id] = true;
			}
			this.set({checked: checked});
			// this.root.set({checked: checked});
		},
		sortMe: function sortMe(arr, sortKey, hashCols, sortType) {
			var nm = hashCols[sortKey];
			return arr.sort(function (a, b) {
				var x = b[nm];
				var y = a[nm];
	                return (x < y ? -1 : (x > y ? 1 : 0)) * (sortType === 'desc' ? -1 : 1);
			});
		},
		pageTo: function pageTo(nm) {
			var ref = this.get();
			var pageFrom = ref.pageFrom;
			this.set({pageCurr: nm});
			nm = nm < 1 ? 1 : (nm > pageFrom ? pageFrom : nm);
			this.setCurrPage(nm);
			return nm;
		},
		viewItem: function viewItem(id) {
			this.root.viewItem(id);
		},
		setCurrPage: function setCurrPage(nm) {
			// console.log('setCurrPage', nm);
			var ref = this.get();
			var items = ref.items;
			var hashCols = ref.hashCols;
			var pageCurr = ref.pageCurr;
			var pagesize = ref.pagesize;
			var sortKey = ref.sortKey;
			var sortType = ref.sortType;
			nm = nm || pageCurr;
			var beg = pagesize * (nm - 1);

			var arr = (sortKey ? this.sortMe(items, sortKey, hashCols, sortType) : items)
				.slice(beg, beg + pagesize);

			var cnt = items.length / pagesize;
			var pf = Math.floor(cnt);
			// console.log('setCurrPage1', nm, arr, cnt);
			this.set({tableItems: arr, pageCurr: nm, pageFrom: pf + (cnt > pf ? 1 : 0)});
		}
	};

	function onstate(ref) {
		var changed = ref.changed;
		var current = ref.current;
		var previous = ref.previous;

		// console.log('Table in onstate', changed, current);
		if (changed.items && current.items.length) {
			this.setCurrPage();
		}
	// },

	// onupdate({ changed, current, previous }) {
		// console.log('Table  in onupdate', changed);
	}
	function click_handler(event) {
		var ref = this._svelte;
		var component = ref.component;
		var ctx = ref.ctx;

		component.viewItem(ctx.it[ctx.hashCols.gmx_id]);
	}

	function change_handler(event) {
		var ref = this._svelte;
		var component = ref.component;
		var ctx = ref.ctx;

		component.checkMe(ctx.it[ctx.hashCols.gmx_id]);
	}

	function get_each_context(ctx, list, i) {
		var child_ctx = Object.create(ctx);
		child_ctx.it = list[i];
		return child_ctx;
	}

	function create_main_fragment(component, ctx) {
		var div2, table, tr0, th0, input0, text0, th1, span0, th1_class_value, text2, th2, span1, th2_class_value, text4, text5, tr1, td, button0, text6, button0_disabled_value, text7, span2, text8, input1, text9, text10, text11, button1, text12, button1_disabled_value, text13, div1, current;

		function click_handler(event) {
			component.checkReverse(event);
		}

		function click_handler_1(event) {
			component.sort('gmx_id');
		}

		function click_handler_2(event) {
			component.sort('FRSTAT');
		}

		var each_value = ctx.tableItems;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block(component, get_each_context(ctx, each_value, i));
		}

		function click_handler_3(event) {
			component.pageTo(ctx.pageCurr - 1);
		}

		function change_handler_1(event) {
			component.pageTo(this.value);
		}

		function click_handler_4(event) {
			component.pageTo(ctx.pageCurr + 1);
		}

		return {
			c: function c() {
				div2 = createElement("div");
				table = createElement("table");
				tr0 = createElement("tr");
				th0 = createElement("th");
				input0 = createElement("input");
				text0 = createText("\r\n\t\t\t");
				th1 = createElement("th");
				span0 = createElement("span");
				span0.textContent = "Id";
				text2 = createText("\r\n\t\t\t");
				th2 = createElement("th");
				span1 = createElement("span");
				span1.textContent = "Статус";
				text4 = createText("\r\n");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				text5 = createText("\r\n\t\t");
				tr1 = createElement("tr");
				td = createElement("td");
				button0 = createElement("button");
				text6 = createText("назад");
				text7 = createText("\r\n\t\t\t\t");
				span2 = createElement("span");
				text8 = createText("Стр. ");
				input1 = createElement("input");
				text9 = createText(" из ");
				text10 = createText(ctx.pageFrom);
				text11 = createText("\r\n\t\t\t\t");
				button1 = createElement("button");
				text12 = createText("вперед");
				text13 = createText("\r\n\t\t\t\t");
				div1 = createElement("div");
				div1.innerHTML = "<div class=\"-loading-inner svelte-1jklu78\"></div>";
				addListener(input0, "click", click_handler);
				input0.checked = ctx.reverse;
				setAttribute(input0, "type", "checkbox");
				input0.value = "on";
				input0.className = "svelte-1jklu78";
				th0.className = "c1 svelte-1jklu78";
				span0.className = "svelte-1jklu78";
				addListener(th1, "click", click_handler_1);
				th1.className = th1_class_value = "c2 sorting \r\n\t\t\t\t\t" + (ctx.sortKey === 'gmx_id' ?
							(ctx.sortType === 'desc' ? 'sorting-desc' : 'sorting-asc')
							: '') + "\r\n\t\t\t\t\t" + " svelte-1jklu78";
				span1.className = "svelte-1jklu78";
				addListener(th2, "click", click_handler_2);
				th2.className = th2_class_value = "c3 sorting \r\n\t\t\t\t\t" + (ctx.sortKey === 'FRSTAT' ?
							(ctx.sortType === 'desc' ? 'sorting-desc' : 'sorting-asc')
							: '') + "\r\n\t\t\t\t\t" + " svelte-1jklu78";
				tr0.className = "head";
				addListener(button0, "click", click_handler_3);
				button0.disabled = button0_disabled_value = ctx.pageCurr === 1;
				button0.className = "svelte-1jklu78";
				addListener(input1, "change", change_handler_1);
				setAttribute(input1, "type", "number");
				input1.value = ctx.pageCurr;
				input1.className = "svelte-1jklu78";
				span2.className = "pageInfo svelte-1jklu78";
				addListener(button1, "click", click_handler_4);
				button1.disabled = button1_disabled_value = ctx.pageFrom === ctx.pageCurr;
				button1.className = "svelte-1jklu78";
				div1.className = "-loading svelte-1jklu78";
				td.colSpan = "3";
				td.className = "svelte-1jklu78";
				tr1.className = "pagination svelte-1jklu78";
				table.className = "table svelte-1jklu78";
				div2.className = "tableContect svelte-1jklu78";
			},

			m: function m(target, anchor) {
				insert(target, div2, anchor);
				append(div2, table);
				append(table, tr0);
				append(tr0, th0);
				append(th0, input0);
				append(tr0, text0);
				append(tr0, th1);
				append(th1, span0);
				append(tr0, text2);
				append(tr0, th2);
				append(th2, span1);
				append(table, text4);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(table, null);
				}

				append(table, text5);
				append(table, tr1);
				append(tr1, td);
				append(td, button0);
				append(button0, text6);
				append(td, text7);
				append(td, span2);
				append(span2, text8);
				append(span2, input1);
				append(span2, text9);
				append(span2, text10);
				append(td, text11);
				append(td, button1);
				append(button1, text12);
				append(td, text13);
				append(td, div1);
				current = true;
			},

			p: function p(changed, _ctx) {
				ctx = _ctx;
				if (changed.reverse) {
					input0.checked = ctx.reverse;
				}

				if ((changed.sortKey || changed.sortType) && th1_class_value !== (th1_class_value = "c2 sorting \r\n\t\t\t\t\t" + (ctx.sortKey === 'gmx_id' ?
							(ctx.sortType === 'desc' ? 'sorting-desc' : 'sorting-asc')
							: '') + "\r\n\t\t\t\t\t" + " svelte-1jklu78")) {
					th1.className = th1_class_value;
				}

				if ((changed.sortKey || changed.sortType) && th2_class_value !== (th2_class_value = "c3 sorting \r\n\t\t\t\t\t" + (ctx.sortKey === 'FRSTAT' ?
							(ctx.sortType === 'desc' ? 'sorting-desc' : 'sorting-asc')
							: '') + "\r\n\t\t\t\t\t" + " svelte-1jklu78")) {
					th2.className = th2_class_value;
				}

				if (changed.tableItems || changed.hashCols || changed.checked) {
					each_value = ctx.tableItems;

					for (var i = 0; i < each_value.length; i += 1) {
						var child_ctx = get_each_context(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(table, text5);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}

				if ((changed.pageCurr) && button0_disabled_value !== (button0_disabled_value = ctx.pageCurr === 1)) {
					button0.disabled = button0_disabled_value;
				}

				if (changed.pageCurr) {
					input1.value = ctx.pageCurr;
				}

				if (changed.pageFrom) {
					setData(text10, ctx.pageFrom);
				}

				if ((changed.pageFrom || changed.pageCurr) && button1_disabled_value !== (button1_disabled_value = ctx.pageFrom === ctx.pageCurr)) {
					button1.disabled = button1_disabled_value;
				}
			},

			i: function i(target, anchor) {
				if (current) { return; }

				this.m(target, anchor);
			},

			o: run,

			d: function d(detach) {
				if (detach) {
					detachNode(div2);
				}

				removeListener(input0, "click", click_handler);
				removeListener(th1, "click", click_handler_1);
				removeListener(th2, "click", click_handler_2);

				destroyEach(each_blocks, detach);

				removeListener(button0, "click", click_handler_3);
				removeListener(input1, "change", change_handler_1);
				removeListener(button1, "click", click_handler_4);
			}
		};
	}

	// (123:0) {#each tableItems as it}
	function create_each_block(component, ctx) {
		var tr, td0, input, input_checked_value, text0, td1, span0, text1_value = ctx.it[ctx.hashCols.gmx_id], text1, text2, td2, span1, span1_class_value, span2;

		return {
			c: function c() {
				tr = createElement("tr");
				td0 = createElement("td");
				input = createElement("input");
				text0 = createText("\r\n\t\t\t");
				td1 = createElement("td");
				span0 = createElement("span");
				text1 = createText(text1_value);
				text2 = createText("\r\n\t\t\t");
				td2 = createElement("td");
				span1 = createElement("span");
				span2 = createElement("span");
				span2.innerHTML = "<svg class=\"svgIcon svelte-1jklu78\"><use xlink:href=\"#zoom-to-feature\" class=\"svelte-1jklu78\"></use></svg>";
				input._svelte = { component: component, ctx: ctx };

				addListener(input, "change", change_handler);
				input.checked = input_checked_value = ctx.checked[ctx.it[ctx.hashCols.gmx_id]];
				setAttribute(input, "type", "checkbox");
				input.className = "svelte-1jklu78";
				td0.className = "c1 svelte-1jklu78";
				span0.className = "svelte-1jklu78";
				td1.className = "c2 svelte-1jklu78";
				span1.className = span1_class_value = "status " + (ctx.it[ctx.hashCols.FRSTAT] > 0 ? 'checked' : '') + " svelte-1jklu78";

				span2._svelte = { component: component, ctx: ctx };

				addListener(span2, "click", click_handler);
				span2.className = "leaflet-gmx-iconSvg svgIcon svelte-1jklu78";
				td2.className = "c3 svelte-1jklu78";
				tr.className = "item";
			},

			m: function m(target, anchor) {
				insert(target, tr, anchor);
				append(tr, td0);
				append(td0, input);
				append(tr, text0);
				append(tr, td1);
				append(td1, span0);
				append(span0, text1);
				append(tr, text2);
				append(tr, td2);
				append(td2, span1);
				append(td2, span2);
			},

			p: function p(changed, _ctx) {
				ctx = _ctx;
				input._svelte.ctx = ctx;
				if ((changed.checked || changed.tableItems || changed.hashCols) && input_checked_value !== (input_checked_value = ctx.checked[ctx.it[ctx.hashCols.gmx_id]])) {
					input.checked = input_checked_value;
				}

				if ((changed.tableItems || changed.hashCols) && text1_value !== (text1_value = ctx.it[ctx.hashCols.gmx_id])) {
					setData(text1, text1_value);
				}

				if ((changed.tableItems || changed.hashCols) && span1_class_value !== (span1_class_value = "status " + (ctx.it[ctx.hashCols.FRSTAT] > 0 ? 'checked' : '') + " svelte-1jklu78")) {
					span1.className = span1_class_value;
				}

				span2._svelte.ctx = ctx;
			},

			d: function d(detach) {
				if (detach) {
					detachNode(tr);
				}

				removeListener(input, "change", change_handler);
				removeListener(span2, "click", click_handler);
			}
		};
	}

	function Table(options) {
		var this$1 = this;

		init(this, options);
		this._state = assign(data(), options.data);
		this._intro = !!options.intro;

		this._handlers.state = [onstate];

		onstate.call(this, { changed: assignTrue({}, this._state), current: this._state });

		this._fragment = create_main_fragment(this, this._state);

		this.root._oncreate.push(function () {
			this$1.fire("update", { changed: assignTrue({}, this$1._state), current: this$1._state });
		});

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(Table.prototype, proto);
	assign(Table.prototype, methods);

	/* src\SelectInput.html generated by Svelte v2.15.3 */

	function value(ref) {
		var key = ref.key;
		var changedParams = ref.changedParams;

		var it = changedParams ? changedParams[key] : {};
		return it && it.value || '';
	}

	function colName(ref) {
		var key = ref.key;
		var changedParams = ref.changedParams;

		var it = changedParams ? changedParams[key] : {};
		return it && it.field || '';
	}

	function isClicked(ref) {
		var key = ref.key;
		var changedParams = ref.changedParams;

		var it = changedParams ? changedParams[key] : {};
		return it && it.field || false;
	}

	function title(ref) {
	var key = ref.key;
	var params = ref.params;
	 var it = params[key]; return it.title || it.value; }

	function data$1() {
		return {
			key: '',
			cols: []
		};
	}
	var methods$1 = {
		setSelection: function setSelection(val) {
			var ref = this.get();
			var key = ref.key;
			var changedParams = ref.changedParams;
	// console.log(colName, `___ setSelection ______`, key, val, changedParams);
			changedParams[key] = {value: '', field: val};
			this.set({changedParams: changedParams});
		},
		setValue: function setValue(val, fieldFlag) {
			var ref = this.get();
			var key = ref.key;
			var changedParams = ref.changedParams;
			changedParams[key] = {value: !fieldFlag ? val : '', field: fieldFlag ? val : ''};
			this.set({changedParams: changedParams});
		}
	};

	function get_each_context$1(ctx, list, i) {
		var child_ctx = Object.create(ctx);
		child_ctx.it = list[i];
		return child_ctx;
	}

	function create_main_fragment$1(component, ctx) {
		var div3, div0, text0, text1, div2, div1, current;

		function select_block_type(ctx) {
			if (ctx.isClicked) { return create_if_block; }
			return create_else_block;
		}

		var current_block_type = select_block_type(ctx);
		var if_block = current_block_type(component, ctx);

		return {
			c: function c() {
				div3 = createElement("div");
				div0 = createElement("div");
				text0 = createText(ctx.title);
				text1 = createText("\r\n\t");
				div2 = createElement("div");
				div1 = createElement("div");
				if_block.c();
				div0.className = "gmx-sidebar-label svelte-tubnte";
				div3.className = "gmx-sidebar-labeled-block svelte-tubnte";
			},

			m: function m(target, anchor) {
				insert(target, div3, anchor);
				append(div3, div0);
				append(div0, text0);
				append(div3, text1);
				append(div3, div2);
				append(div2, div1);
				if_block.m(div1, null);
				current = true;
			},

			p: function p(changed, ctx) {
				if (changed.title) {
					setData(text0, ctx.title);
				}

				if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
					if_block.p(changed, ctx);
				} else {
					if_block.d(1);
					if_block = current_block_type(component, ctx);
					if_block.c();
					if_block.m(div1, null);
				}
			},

			i: function i(target, anchor) {
				if (current) { return; }

				this.m(target, anchor);
			},

			o: run,

			d: function d(detach) {
				if (detach) {
					detachNode(div3);
				}

				if_block.d();
			}
		};
	}

	// (52:3) {:else}
	function create_else_block(component, ctx) {
		var input, text, button;

		function change_handler(event) {
			component.setValue(event.target.value);
		}

		function click_handler(event) {
			component.setValue(ctx.cols[0], true);
		}

		return {
			c: function c() {
				input = createElement("input");
				text = createText("\r\n\t\t\t\t");
				button = createElement("button");
				addListener(input, "change", change_handler);
				setAttribute(input, "type", "text");
				input.className = "gmx-sidebar-input-with-addon svelte-tubnte";
				input.value = ctx.value;
				addListener(button, "click", click_handler);
				button.className = "gmx-addon-button svelte-tubnte";
				button.title = "выбрать из таблицы атрибутов";
			},

			m: function m(target, anchor) {
				insert(target, input, anchor);
				component.refs.inp = input;
				insert(target, text, anchor);
				insert(target, button, anchor);
			},

			p: function p(changed, _ctx) {
				ctx = _ctx;
				if (changed.value) {
					input.value = ctx.value;
				}
			},

			d: function d(detach) {
				if (detach) {
					detachNode(input);
				}

				removeListener(input, "change", change_handler);
				if (component.refs.inp === input) { component.refs.inp = null; }
				if (detach) {
					detachNode(text);
					detachNode(button);
				}

				removeListener(button, "click", click_handler);
			}
		};
	}

	// (45:3) {#if isClicked}
	function create_if_block(component, ctx) {
		var select, text, button;

		var each_value = ctx.cols;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block$1(component, get_each_context$1(ctx, each_value, i));
		}

		function change_handler(event) {
			component.setSelection(event.target.options[event.target.selectedIndex].value);
		}

		function click_handler(event) {
			component.setValue('');
		}

		return {
			c: function c() {
				select = createElement("select");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				text = createText("\r\n\t\t\t\t");
				button = createElement("button");
				addListener(select, "change", change_handler);
				select.className = "gmx-sidebar-select-with-addon svelte-tubnte";
				addListener(button, "click", click_handler);
				button.className = "gmx-addon-button svelte-tubnte";
				button.title = "выбрать из таблицы атрибутов";
			},

			m: function m(target, anchor) {
				insert(target, select, anchor);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(select, null);
				}

				component.refs.sel = select;
				insert(target, text, anchor);
				insert(target, button, anchor);
			},

			p: function p(changed, ctx) {
				if (changed.cols || changed.colName) {
					each_value = ctx.cols;

					for (var i = 0; i < each_value.length; i += 1) {
						var child_ctx = get_each_context$1(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$1(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(select, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}
			},

			d: function d(detach) {
				if (detach) {
					detachNode(select);
				}

				destroyEach(each_blocks, detach);

				removeListener(select, "change", change_handler);
				if (component.refs.sel === select) { component.refs.sel = null; }
				if (detach) {
					detachNode(text);
					detachNode(button);
				}

				removeListener(button, "click", click_handler);
			}
		};
	}

	// (47:5) {#each cols as it}
	function create_each_block$1(component, ctx) {
		var option, text_value = ctx.it, text, option_value_value, option_selected_value;

		return {
			c: function c() {
				option = createElement("option");
				text = createText(text_value);
				option.__value = option_value_value = ctx.it;
				option.value = option.__value;
				option.selected = option_selected_value = ctx.colName === ctx.it;
			},

			m: function m(target, anchor) {
				insert(target, option, anchor);
				append(option, text);
			},

			p: function p(changed, ctx) {
				if ((changed.cols) && text_value !== (text_value = ctx.it)) {
					setData(text, text_value);
				}

				if ((changed.cols) && option_value_value !== (option_value_value = ctx.it)) {
					option.__value = option_value_value;
				}

				option.value = option.__value;
				if ((changed.colName || changed.cols) && option_selected_value !== (option_selected_value = ctx.colName === ctx.it)) {
					option.selected = option_selected_value;
				}
			},

			d: function d(detach) {
				if (detach) {
					detachNode(option);
				}
			}
		};
	}

	function SelectInput(options) {
		init(this, options);
		this.refs = {};
		this._state = assign(data$1(), options.data);

		this._recompute({ key: 1, changedParams: 1, params: 1 }, this._state);
		this._intro = !!options.intro;

		this._fragment = create_main_fragment$1(this, this._state);

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);
		}

		this._intro = true;
	}

	assign(SelectInput.prototype, proto);
	assign(SelectInput.prototype, methods$1);

	SelectInput.prototype._recompute = function _recompute(changed, state) {
		if (changed.key || changed.changedParams) {
			if (this._differs(state.value, (state.value = value(state)))) { changed.value = true; }
			if (this._differs(state.colName, (state.colName = colName(state)))) { changed.colName = true; }
			if (this._differs(state.isClicked, (state.isClicked = isClicked(state)))) { changed.isClicked = true; }
		}

		if (changed.key || changed.params) {
			if (this._differs(state.title, (state.title = title(state)))) { changed.title = true; }
		}
	};

	/* src\App.html generated by Svelte v2.15.3 */

	var stateStorage = getState();

	function data$2() {
		return {
			stateSave: 0,
			changedParams: {},
			params: {
				layerID: {value: '', title: 'Выбор слоя'},
				quadrantLayerId: {value: '', title: 'Слой квартальной сети'},
				reportType: {value: 'об использовании лесов', options: ['об использовании лесов', 'о воспроизводстве лесов'], title: 'Тип отчета'},
				organizationName: {value: 'Наименование организации'},
				inn: {value: '1234567890', title: 'ИНН'},
				region: {value: 'Субъект', title: 'Субъект Российской Федерации'},
				forestry: {value: '', title: 'Лесничество'},
				sectionForestry: {value: 'Участковое лесничество'},
				quadrant: {value: 'Квартал'},
				stratum: {value: 'Выдел'},
				fellingForm: {value: '', title: 'Форма рубки'},
				fellingType: {value: '', title: 'Тип рубки'},
				recoveryEventType: {value: '', title: 'Тип мероприятия'},
				siteArea: {value: 'Площадь'},
				scale: {value: 'Масштаб'},
				site: {value: 'Делянка'}
			},
			layerItems: [],
			format: 2,
			limit: 0,
			report: false,
			drawstart: false,
			layerID: '',
			quadrantLayerId: '',
			reportType: '',
			checked: {},
			layerIds: [], quadrantIds: [],
			hashCols: {},
			cols: []
		}
	}
	var methods$2 = {
		viewItem: function viewItem(id) {
			var ref = this.get();
			var map = ref.map;
			var layerItems = ref.layerItems;
			var hashCols = ref.hashCols;

			for (var i = 0, len = layerItems.length; i < len; i++) {
				var it = layerItems[i];
				if (id === it[hashCols.gmx_id]) {
					var geo = it[hashCols.geomixergeojson],
						bbox = L.gmxUtil.getGeometryBounds(geo),
						latlngBbox = L.latLngBounds([[bbox.min.y, bbox.min.x], [bbox.max.y, bbox.max.x]]);
					map.fitBounds(latlngBbox);
					break;
				}
			}
		},
		sendReport: function sendReport$$1() {
			var this$1 = this;

			var ref = this.get();
			var checked = ref.checked;
			var layerItems = ref.layerItems;
			var hashCols = ref.hashCols;
			var params = ref.params;
			var format = ref.format;
			var layerID = ref.layerID;
			var gmxMap = ref.gmxMap;
			var changedParams = ref.changedParams;
			this.set({report: true});
			sendReport(checked, layerItems, hashCols, params, format, layerID, gmxMap, changedParams)
			.then(function (json) { this$1.set(json); });
		},
		startDrawing: function startDrawing(ev) {
			var this$1 = this;

			var ref = this.get();
			var map = ref.map;
			var drawstart = ref.drawstart;
			var layerID = ref.layerID;
			var checked = ref.checked;
			this.set({drawstart: !drawstart});
			if(!drawstart) {
				map.gmxDrawing.clear();
				map.gmxDrawing.create('Polygon');
				map.gmxDrawing.on('drawstop', function (e) {
					this$1.set({drawstart: false});
					selectFeaturesWithDrawing(layerID, e.object.toGeoJSON().geometry)
						.then(function (json) {
							this$1.set({checked: L.extend(json, checked)});
						});
				}, this);
				map._gmxEventsManager._drawstart = true;
			}

		},
		getKeyState: function getKeyState(key) {
			var ref = this.get();
			var changedParams = ref.changedParams;
			return changedParams[key];
		},
		setField: function setField(key, data) {
			var ref = this.get();
			var changedParams = ref.changedParams;
			changedParams[key] = data;
			this.set({changedParams: changedParams});
		},
		setNodeField: function setNodeField(node, setFlag) {
			var val = node.options ? node.options[node.selectedIndex].value : node.value,
				name = node.name;
			this.setField(name, val);
			if (setFlag) {
				var attr = {};
				attr[name] = val;
				this.set(attr);
			}
		},
		colsToHash: function colsToHash(arr) {
			return arr.reduce(function (a, v, i) { a[v] = i; return a; }, {});
		},

		styleHook: function styleHook(it) {
			var ref = this.get();
			var checked = ref.checked;
			return checked[it.id] ? { strokeStyle: '#00ffff' } : {};
		},
		checkState: function checkState() {
			var ref = this.get();
			var changedParams = ref.changedParams;
			var target = this.options.target;
			for(var key in changedParams) {
				var it = changedParams[key],
					node = this.refs[key];

				if (node) {
					if (typeof(it) !== 'object') {
						node.value = it;
					}
				}
				if (key === 'reportType') {
					this.set({reportType: it});
				}
			}
		}
	};

	function onstate$1(ref) {
		var this$1 = this;
		var changed = ref.changed;
		var current = ref.current;
		var previous = ref.previous;

		// console.log('in onstate', changed, current);
		if (changed.gmxMap) {
			if (current.stateSave === 1) { this.set({changedParams: stateStorage}); }
			getLayersIds(current.meta, current.gmxMap).then(function (json) { this$1.set(json); });
		}
		if (changed.layerID && current.layerID) {
			var ref$1 = this.get();
			var gmxMap = ref$1.gmxMap;
			var checked = ref$1.checked;
			this.currentLayer = gmxMap.layersByID[current.layerID];
			if (this.currentLayer) {
				this.currentLayer.setStyleHook(this.styleHook.bind(this));
			}
			loadFeatures(current.layerID)
			.then(function (json) {
				if (json.Status === 'ok') {
					var cols = json.Result.fields;
					this$1.set({cols: cols, hashCols: this$1.colsToHash(cols),layerItems: json.Result.values});
				}
			});
		}
		if (changed.checked && this.currentLayer) {
			this.currentLayer.repaint();
		}
	}
	function onupdate(ref) {
		var changed = ref.changed;
		var current = ref.current;
		var previous = ref.previous;

		if (changed.cols) {
			this.checkState();
		}
	}
	function get_each_context_2(ctx, list, i) {
		var child_ctx = Object.create(ctx);
		child_ctx.it = list[i];
		return child_ctx;
	}

	function get_each_context_1(ctx, list, i) {
		var child_ctx = Object.create(ctx);
		child_ctx.it = list[i];
		return child_ctx;
	}

	function get_each_context$2(ctx, list, i) {
		var child_ctx = Object.create(ctx);
		child_ctx.it = list[i];
		return child_ctx;
	}

	function create_main_fragment$2(component, ctx) {
		var div2, div0, text0, text1, text2, div1, span, text4, select, option, text5, current;

		var if_block0 = (ctx.layerIds) && create_if_block_4(component, ctx);

		function change_handler(event) {
			component.setNodeField(this, true);
		}

		var if_block1 = (ctx.layerID) && create_if_block$1(component, ctx);

		return {
			c: function c() {
				div2 = createElement("div");
				div0 = createElement("div");
				text0 = createText("Лимит отчетов: ");
				text1 = createText(ctx.limit);
				text2 = createText("\r\n\t");
				div1 = createElement("div");
				span = createElement("span");
				span.textContent = "Выбор слоя";
				text4 = createText("\r\n\t\t");
				select = createElement("select");
				option = createElement("option");
				if (if_block0) { if_block0.c(); }
				text5 = createText("\r\n");
				if (if_block1) { if_block1.c(); }
				div0.className = "forest-plugin-header svelte-qidupr";
				span.className = "gmx-select-layer-container__label svelte-qidupr";
				option.__value = "";
				option.value = option.__value;
				option.className = "svelte-qidupr";
				addListener(select, "change", change_handler);
				select.name = "layerID";
				select.className = "gmx-sidebar-select-medium svelte-qidupr";
				div1.className = "gmx-select-layer-container svelte-qidupr";
				div2.className = "forest-plugin-container svelte-qidupr";
			},

			m: function m(target, anchor) {
				insert(target, div2, anchor);
				append(div2, div0);
				append(div0, text0);
				append(div0, text1);
				append(div2, text2);
				append(div2, div1);
				append(div1, span);
				append(div1, text4);
				append(div1, select);
				append(select, option);
				if (if_block0) { if_block0.m(select, null); }
				append(div2, text5);
				if (if_block1) { if_block1.m(div2, null); }
				current = true;
			},

			p: function p(changed, ctx) {
				if (!current || changed.limit) {
					setData(text1, ctx.limit);
				}

				if (ctx.layerIds) {
					if (if_block0) {
						if_block0.p(changed, ctx);
					} else {
						if_block0 = create_if_block_4(component, ctx);
						if_block0.c();
						if_block0.m(select, null);
					}
				} else if (if_block0) {
					if_block0.d(1);
					if_block0 = null;
				}

				if (ctx.layerID) {
					if (if_block1) {
						if_block1.p(changed, ctx);
					} else {
						if_block1 = create_if_block$1(component, ctx);
						if (if_block1) { if_block1.c(); }
					}

					if_block1.i(div2, null);
				} else if (if_block1) {
					if_block1.o(function() {
						if_block1.d(1);
						if_block1 = null;
					});
				}
			},

			i: function i(target, anchor) {
				if (current) { return; }

				this.m(target, anchor);
			},

			o: function o(outrocallback) {
				if (!current) { return; }

				if (if_block1) { if_block1.o(outrocallback); }
				else { outrocallback(); }

				current = false;
			},

			d: function d(detach) {
				if (detach) {
					detachNode(div2);
				}

				if (if_block0) { if_block0.d(); }
				removeListener(select, "change", change_handler);
				if (if_block1) { if_block1.d(); }
			}
		};
	}

	// (169:3) {#if layerIds}
	function create_if_block_4(component, ctx) {
		var each_anchor;

		var each_value = ctx.layerIds;

		var each_blocks = [];

		for (var i = 0; i < each_value.length; i += 1) {
			each_blocks[i] = create_each_block_2(component, get_each_context$2(ctx, each_value, i));
		}

		return {
			c: function c() {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				each_anchor = createComment();
			},

			m: function m(target, anchor) {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(target, anchor);
				}

				insert(target, each_anchor, anchor);
			},

			p: function p(changed, ctx) {
				if (changed.layerIds || changed.layerID) {
					each_value = ctx.layerIds;

					for (var i = 0; i < each_value.length; i += 1) {
						var child_ctx = get_each_context$2(ctx, each_value, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_2(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(each_anchor.parentNode, each_anchor);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value.length;
				}
			},

			d: function d(detach) {
				destroyEach(each_blocks, detach);

				if (detach) {
					detachNode(each_anchor);
				}
			}
		};
	}

	// (170:4) {#each layerIds as it}
	function create_each_block_2(component, ctx) {
		var option, text_value = ctx.it.title, text, option_value_value, option_selected_value;

		return {
			c: function c() {
				option = createElement("option");
				text = createText(text_value);
				option.__value = option_value_value = ctx.it.id;
				option.value = option.__value;
				option.selected = option_selected_value = ctx.layerID === ctx.it.id;
				option.className = "svelte-qidupr";
			},

			m: function m(target, anchor) {
				insert(target, option, anchor);
				append(option, text);
			},

			p: function p(changed, ctx) {
				if ((changed.layerIds) && text_value !== (text_value = ctx.it.title)) {
					setData(text, text_value);
				}

				if ((changed.layerIds) && option_value_value !== (option_value_value = ctx.it.id)) {
					option.__value = option_value_value;
				}

				option.value = option.__value;
				if ((changed.layerID || changed.layerIds) && option_selected_value !== (option_selected_value = ctx.layerID === ctx.it.id)) {
					option.selected = option_selected_value;
				}
			},

			d: function d(detach) {
				if (detach) {
					detachNode(option);
				}
			}
		};
	}

	// (176:0) {#if layerID}
	function create_if_block$1(component, ctx) {
		var div19, div0, text1, div12, div11, div2, div1, text2_value = ctx.params.reportType.title, text2, text3, select0, text4, text5, div4, div3, text6_value = ctx.params.organizationName.title || ctx.params.organizationName.value, text6, text7, input0, input0_value_value, text8, div6, div5, text9_value = ctx.params.inn.title || ctx.params.inn.value, text9, text10, input1, input1_value_value, text11, selectinput0_updating = {}, text12, selectinput1_updating = {}, text13, selectinput2_updating = {}, text14, selectinput3_updating = {}, text15, selectinput4_updating = {}, text16, selectinput5_updating = {}, text17, selectinput6_updating = {}, text18, selectinput7_updating = {}, text19, div8, div7, text20_value = ctx.params.scale.title || ctx.params.scale.value, text20, text21, select1, option0, option1, option2, option3, option4, option5, option6, option7, option8, option9, text32, div10, div9, text33_value = ctx.params.quadrantLayerId.title || ctx.params.quadrantLayerId.value, text33, text34, select2, option10, text35, div13, text37, div17, div16, div14, button, text38_value = ctx.drawstart ? 'Полигон рисуется' :'Выделите участки полигоном', text38, text39, div15, text40, text41_value = ctx.Object.keys(ctx.checked).length, text41, text42, text43_value = ctx.layerItems.length, text43, text44, table_updating = {}, text45, div18, current;

		var each_value_1 = ctx.params.reportType.options;

		var each_blocks = [];

		for (var i = 0; i < each_value_1.length; i += 1) {
			each_blocks[i] = create_each_block_1(component, get_each_context_1(ctx, each_value_1, i));
		}

		function change_handler(event) {
			component.setNodeField(this, true);
		}

		var if_block0 = (ctx.reportType !== 'о воспроизводстве лесов') && create_if_block_3(component, ctx);

		function change_handler_1(event) {
			component.setNodeField(this);
		}

		function change_handler_2(event) {
			component.setNodeField(this);
		}

		var selectinput0_initial_data = { key: "region" };
		if (ctx.params  !== void 0) {
			selectinput0_initial_data.params = ctx.params ;
			selectinput0_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput0_initial_data.cols = ctx.cols ;
			selectinput0_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput0_initial_data.changedParams = ctx.changedParams ;
			selectinput0_updating.changedParams = true;
		}
		var selectinput0 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput0_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput0_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput0_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput0_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput0_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput0._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput0.get());
		});

		var selectinput1_initial_data = { key: "forestry" };
		if (ctx.params  !== void 0) {
			selectinput1_initial_data.params = ctx.params ;
			selectinput1_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput1_initial_data.cols = ctx.cols ;
			selectinput1_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput1_initial_data.changedParams = ctx.changedParams ;
			selectinput1_updating.changedParams = true;
		}
		var selectinput1 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput1_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput1_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput1_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput1_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput1_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput1._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput1.get());
		});

		var selectinput2_initial_data = { key: "sectionForestry" };
		if (ctx.params  !== void 0) {
			selectinput2_initial_data.params = ctx.params ;
			selectinput2_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput2_initial_data.cols = ctx.cols ;
			selectinput2_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput2_initial_data.changedParams = ctx.changedParams ;
			selectinput2_updating.changedParams = true;
		}
		var selectinput2 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput2_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput2_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput2_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput2_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput2_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput2._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput2.get());
		});

		var selectinput3_initial_data = { key: "quadrant" };
		if (ctx.params  !== void 0) {
			selectinput3_initial_data.params = ctx.params ;
			selectinput3_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput3_initial_data.cols = ctx.cols ;
			selectinput3_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput3_initial_data.changedParams = ctx.changedParams ;
			selectinput3_updating.changedParams = true;
		}
		var selectinput3 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput3_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput3_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput3_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput3_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput3_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput3._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput3.get());
		});

		var selectinput4_initial_data = { key: "stratum" };
		if (ctx.params  !== void 0) {
			selectinput4_initial_data.params = ctx.params ;
			selectinput4_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput4_initial_data.cols = ctx.cols ;
			selectinput4_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput4_initial_data.changedParams = ctx.changedParams ;
			selectinput4_updating.changedParams = true;
		}
		var selectinput4 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput4_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput4_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput4_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput4_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput4_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput4._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput4.get());
		});

		var selectinput5_initial_data = { key: "site" };
		if (ctx.params  !== void 0) {
			selectinput5_initial_data.params = ctx.params ;
			selectinput5_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput5_initial_data.cols = ctx.cols ;
			selectinput5_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput5_initial_data.changedParams = ctx.changedParams ;
			selectinput5_updating.changedParams = true;
		}
		var selectinput5 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput5_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput5_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput5_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput5_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput5_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput5._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput5.get());
		});

		var selectinput6_initial_data = { key: "recoveryEventType" };
		if (ctx.params  !== void 0) {
			selectinput6_initial_data.params = ctx.params ;
			selectinput6_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput6_initial_data.cols = ctx.cols ;
			selectinput6_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput6_initial_data.changedParams = ctx.changedParams ;
			selectinput6_updating.changedParams = true;
		}
		var selectinput6 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput6_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput6_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput6_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput6_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput6_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput6._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput6.get());
		});

		var selectinput7_initial_data = { key: "siteArea" };
		if (ctx.params  !== void 0) {
			selectinput7_initial_data.params = ctx.params ;
			selectinput7_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput7_initial_data.cols = ctx.cols ;
			selectinput7_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput7_initial_data.changedParams = ctx.changedParams ;
			selectinput7_updating.changedParams = true;
		}
		var selectinput7 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput7_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput7_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput7_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput7_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput7_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput7._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput7.get());
		});

		function change_handler_3(event) {
			component.setNodeField(this, true);
		}

		var if_block1 = (ctx.quadrantIds) && create_if_block_2(component, ctx);

		function change_handler_4(event) {
			component.setNodeField(this, true);
		}

		function click_handler(event) {
			component.startDrawing(event);
		}

		var table_initial_data = {
		 	items: ctx.layerItems,
		 	hashCols: ctx.hashCols
		 };
		if (ctx.checked  !== void 0) {
			table_initial_data.checked = ctx.checked ;
			table_updating.checked = true;
		}
		var table = new Table({
			root: component.root,
			store: component.store,
			data: table_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!table_updating.checked && changed.checked) {
					newState.checked = childState.checked;
				}
				component._set(newState);
				table_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			table._bind({ checked: 1 }, table.get());
		});

		function select_block_type(ctx) {
			if (ctx.report) { return create_if_block_1; }
			return create_else_block$1;
		}

		var current_block_type = select_block_type(ctx);
		var if_block2 = current_block_type(component, ctx);

		return {
			c: function c() {
				div19 = createElement("div");
				div0 = createElement("div");
				div0.textContent = "Ввод информации";
				text1 = createText("\r\n\t\t\t");
				div12 = createElement("div");
				div11 = createElement("div");
				div2 = createElement("div");
				div1 = createElement("div");
				text2 = createText(text2_value);
				text3 = createText("\r\n\t\t\t\t\t\t");
				select0 = createElement("select");

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				text4 = createText("\r\n");
				if (if_block0) { if_block0.c(); }
				text5 = createText("\r\n\t\t\t\t\t");
				div4 = createElement("div");
				div3 = createElement("div");
				text6 = createText(text6_value);
				text7 = createText("\r\n\t\t\t\t\t\t");
				input0 = createElement("input");
				text8 = createText("\r\n\t\t\t\t\t");
				div6 = createElement("div");
				div5 = createElement("div");
				text9 = createText(text9_value);
				text10 = createText("\r\n\t\t\t\t\t\t");
				input1 = createElement("input");
				text11 = createText("\r\n\r\n\t\t\t\t\t");
				selectinput0._fragment.c();
				text12 = createText("\r\n\t\t\t\t\t");
				selectinput1._fragment.c();
				text13 = createText("\r\n\t\t\t\t\t");
				selectinput2._fragment.c();
				text14 = createText("\r\n\t\t\t\t\t");
				selectinput3._fragment.c();
				text15 = createText("\r\n\t\t\t\t\t");
				selectinput4._fragment.c();
				text16 = createText("\r\n\t\t\t\t\t");
				selectinput5._fragment.c();
				text17 = createText("\r\n\t\t\t\t\t");
				selectinput6._fragment.c();
				text18 = createText("\r\n\t\t\t\t\t");
				selectinput7._fragment.c();
				text19 = createText("\r\n\r\n\t\t\t\t\t");
				div8 = createElement("div");
				div7 = createElement("div");
				text20 = createText(text20_value);
				text21 = createText("\r\n\t\t\t\t\t\t");
				select1 = createElement("select");
				option0 = createElement("option");
				option0.textContent = "1:5000";
				option1 = createElement("option");
				option1.textContent = "1:10000";
				option2 = createElement("option");
				option2.textContent = "1:15000";
				option3 = createElement("option");
				option3.textContent = "1:20000";
				option4 = createElement("option");
				option4.textContent = "1:25000";
				option5 = createElement("option");
				option5.textContent = "1:30000";
				option6 = createElement("option");
				option6.textContent = "1:35000";
				option7 = createElement("option");
				option7.textContent = "1:40000";
				option8 = createElement("option");
				option8.textContent = "1:45000";
				option9 = createElement("option");
				option9.textContent = "1:50000";
				text32 = createText("\r\n\t\t\t\t\t");
				div10 = createElement("div");
				div9 = createElement("div");
				text33 = createText(text33_value);
				text34 = createText("\r\n\t\t\t\t\t\t");
				select2 = createElement("select");
				option10 = createElement("option");
				if (if_block1) { if_block1.c(); }
				text35 = createText("\r\n\t\t\t");
				div13 = createElement("div");
				div13.textContent = "Список объектов";
				text37 = createText("\r\n\t\t\t");
				div17 = createElement("div");
				div16 = createElement("div");
				div14 = createElement("div");
				button = createElement("button");
				text38 = createText(text38_value);
				text39 = createText("\r\n\t\t\t\t\t");
				div15 = createElement("div");
				text40 = createText("Выделено: ");
				text41 = createText(text41_value);
				text42 = createText(" / ");
				text43 = createText(text43_value);
				text44 = createText("\r\n\t\t\t\t\t");
				table._fragment.c();
				text45 = createText("\r\n\t\t\t");
				div18 = createElement("div");
				if_block2.c();
				div0.className = "gmx-sidebar-label-medium svelte-qidupr";
				div1.className = "gmx-sidebar-label svelte-qidupr";
				addListener(select0, "change", change_handler);
				select0.name = "reportType";
				select0.className = "reportType gmx-sidebar-select-large svelte-qidupr";
				div2.className = "gmx-sidebar-labeled-block svelte-qidupr";
				div3.className = "gmx-sidebar-label-small svelte-qidupr";
				addListener(input0, "change", change_handler_1);
				input0.name = "organizationName";
				input0.value = input0_value_value = ctx.params.organizationName.value;
				setAttribute(input0, "type", "text");
				input0.className = "organizationName gmx-sidebar-input-large svelte-qidupr";
				div4.className = "gmx-sidebar-labeled-block svelte-qidupr";
				div5.className = "gmx-sidebar-label-small svelte-qidupr";
				addListener(input1, "change", change_handler_2);
				input1.name = "inn";
				input1.value = input1_value_value = ctx.params.inn.value;
				setAttribute(input1, "type", "text");
				input1.className = "inn gmx-sidebar-input-large svelte-qidupr";
				div6.className = "gmx-sidebar-labeled-block svelte-qidupr";
				div7.className = "gmx-sidebar-label svelte-qidupr";
				option0.__value = "5000";
				option0.value = option0.__value;
				option0.className = "svelte-qidupr";
				option1.__value = "10000";
				option1.value = option1.__value;
				option1.className = "svelte-qidupr";
				option2.__value = "15000";
				option2.value = option2.__value;
				option2.className = "svelte-qidupr";
				option3.__value = "20000";
				option3.value = option3.__value;
				option3.className = "svelte-qidupr";
				option4.__value = "25000";
				option4.value = option4.__value;
				option4.className = "svelte-qidupr";
				option5.__value = "30000";
				option5.value = option5.__value;
				option5.className = "svelte-qidupr";
				option6.__value = "35000";
				option6.value = option6.__value;
				option6.className = "svelte-qidupr";
				option7.__value = "40000";
				option7.value = option7.__value;
				option7.className = "svelte-qidupr";
				option8.__value = "45000";
				option8.value = option8.__value;
				option8.className = "svelte-qidupr";
				option9.__value = "50000";
				option9.value = option9.__value;
				option9.className = "svelte-qidupr";
				addListener(select1, "change", change_handler_3);
				select1.name = "scale";
				select1.className = "scale gmx-sidebar-select-large svelte-qidupr";
				div8.className = "gmx-sidebar-labeled-block svelte-qidupr";
				div9.className = "gmx-sidebar-label svelte-qidupr";
				option10.__value = "";
				option10.value = option10.__value;
				option10.className = "svelte-qidupr";
				addListener(select2, "change", change_handler_4);
				select2.name = "quadrantLayerId";
				select2.className = "quadrantLayerId gmx-sidebar-select-large svelte-qidupr";
				div10.className = "gmx-sidebar-labeled-block svelte-qidupr";
				div13.className = "gmx-sidebar-label-medium svelte-qidupr";
				addListener(button, "click", click_handler);
				button.className = "gmx-sidebar-button svelte-qidupr";
				div14.className = "gmx-geometry-select-container svelte-qidupr";
				div15.className = "gmx-sidebar-label-medium svelte-qidupr";
				div17.className = "forest-features-block svelte-qidupr";
				div18.className = "gmx-button-container svelte-qidupr";
				div19.className = "leftContent forest-plugin-content svelte-qidupr";
			},

			m: function m(target, anchor) {
				insert(target, div19, anchor);
				append(div19, div0);
				append(div19, text1);
				append(div19, div12);
				append(div12, div11);
				append(div11, div2);
				append(div2, div1);
				append(div1, text2);
				append(div2, text3);
				append(div2, select0);

				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(select0, null);
				}

				component.refs.reportType = select0;
				append(div11, text4);
				if (if_block0) { if_block0.m(div11, null); }
				append(div11, text5);
				append(div11, div4);
				append(div4, div3);
				append(div3, text6);
				append(div4, text7);
				append(div4, input0);
				component.refs.organizationName = input0;
				append(div11, text8);
				append(div11, div6);
				append(div6, div5);
				append(div5, text9);
				append(div6, text10);
				append(div6, input1);
				component.refs.inn = input1;
				append(div11, text11);
				selectinput0._mount(div11, null);
				append(div11, text12);
				selectinput1._mount(div11, null);
				append(div11, text13);
				selectinput2._mount(div11, null);
				append(div11, text14);
				selectinput3._mount(div11, null);
				append(div11, text15);
				selectinput4._mount(div11, null);
				append(div11, text16);
				selectinput5._mount(div11, null);
				append(div11, text17);
				selectinput6._mount(div11, null);
				append(div11, text18);
				selectinput7._mount(div11, null);
				append(div11, text19);
				append(div11, div8);
				append(div8, div7);
				append(div7, text20);
				append(div8, text21);
				append(div8, select1);
				append(select1, option0);
				append(select1, option1);
				append(select1, option2);
				append(select1, option3);
				append(select1, option4);
				append(select1, option5);
				append(select1, option6);
				append(select1, option7);
				append(select1, option8);
				append(select1, option9);
				component.refs.scale = select1;
				append(div11, text32);
				append(div11, div10);
				append(div10, div9);
				append(div9, text33);
				append(div10, text34);
				append(div10, select2);
				append(select2, option10);
				if (if_block1) { if_block1.m(select2, null); }
				component.refs.quadrantLayerId = select2;
				append(div19, text35);
				append(div19, div13);
				append(div19, text37);
				append(div19, div17);
				append(div17, div16);
				append(div16, div14);
				append(div14, button);
				append(button, text38);
				append(div16, text39);
				append(div16, div15);
				append(div15, text40);
				append(div15, text41);
				append(div15, text42);
				append(div15, text43);
				append(div16, text44);
				table._mount(div16, null);
				append(div19, text45);
				append(div19, div18);
				if_block2.m(div18, null);
				current = true;
			},

			p: function p(changed, _ctx) {
				ctx = _ctx;
				if ((!current || changed.params) && text2_value !== (text2_value = ctx.params.reportType.title)) {
					setData(text2, text2_value);
				}

				if (changed.params) {
					each_value_1 = ctx.params.reportType.options;

					for (var i = 0; i < each_value_1.length; i += 1) {
						var child_ctx = get_each_context_1(ctx, each_value_1, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block_1(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(select0, null);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_1.length;
				}

				if (ctx.reportType !== 'о воспроизводстве лесов') {
					if (if_block0) {
						if_block0.p(changed, ctx);
					} else {
						if_block0 = create_if_block_3(component, ctx);
						if (if_block0) { if_block0.c(); }
					}

					if_block0.i(div11, text5);
				} else if (if_block0) {
					if_block0.o(function() {
						if_block0.d(1);
						if_block0 = null;
					});
				}

				if ((!current || changed.params) && text6_value !== (text6_value = ctx.params.organizationName.title || ctx.params.organizationName.value)) {
					setData(text6, text6_value);
				}

				if ((!current || changed.params) && input0_value_value !== (input0_value_value = ctx.params.organizationName.value)) {
					input0.value = input0_value_value;
				}

				if ((!current || changed.params) && text9_value !== (text9_value = ctx.params.inn.title || ctx.params.inn.value)) {
					setData(text9, text9_value);
				}

				if ((!current || changed.params) && input1_value_value !== (input1_value_value = ctx.params.inn.value)) {
					input1.value = input1_value_value;
				}

				var selectinput0_changes = {};
				if (!selectinput0_updating.params && changed.params) {
					selectinput0_changes.params = ctx.params ;
					selectinput0_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput0_updating.cols && changed.cols) {
					selectinput0_changes.cols = ctx.cols ;
					selectinput0_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput0_updating.changedParams && changed.changedParams) {
					selectinput0_changes.changedParams = ctx.changedParams ;
					selectinput0_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput0._set(selectinput0_changes);
				selectinput0_updating = {};

				var selectinput1_changes = {};
				if (!selectinput1_updating.params && changed.params) {
					selectinput1_changes.params = ctx.params ;
					selectinput1_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput1_updating.cols && changed.cols) {
					selectinput1_changes.cols = ctx.cols ;
					selectinput1_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput1_updating.changedParams && changed.changedParams) {
					selectinput1_changes.changedParams = ctx.changedParams ;
					selectinput1_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput1._set(selectinput1_changes);
				selectinput1_updating = {};

				var selectinput2_changes = {};
				if (!selectinput2_updating.params && changed.params) {
					selectinput2_changes.params = ctx.params ;
					selectinput2_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput2_updating.cols && changed.cols) {
					selectinput2_changes.cols = ctx.cols ;
					selectinput2_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput2_updating.changedParams && changed.changedParams) {
					selectinput2_changes.changedParams = ctx.changedParams ;
					selectinput2_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput2._set(selectinput2_changes);
				selectinput2_updating = {};

				var selectinput3_changes = {};
				if (!selectinput3_updating.params && changed.params) {
					selectinput3_changes.params = ctx.params ;
					selectinput3_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput3_updating.cols && changed.cols) {
					selectinput3_changes.cols = ctx.cols ;
					selectinput3_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput3_updating.changedParams && changed.changedParams) {
					selectinput3_changes.changedParams = ctx.changedParams ;
					selectinput3_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput3._set(selectinput3_changes);
				selectinput3_updating = {};

				var selectinput4_changes = {};
				if (!selectinput4_updating.params && changed.params) {
					selectinput4_changes.params = ctx.params ;
					selectinput4_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput4_updating.cols && changed.cols) {
					selectinput4_changes.cols = ctx.cols ;
					selectinput4_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput4_updating.changedParams && changed.changedParams) {
					selectinput4_changes.changedParams = ctx.changedParams ;
					selectinput4_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput4._set(selectinput4_changes);
				selectinput4_updating = {};

				var selectinput5_changes = {};
				if (!selectinput5_updating.params && changed.params) {
					selectinput5_changes.params = ctx.params ;
					selectinput5_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput5_updating.cols && changed.cols) {
					selectinput5_changes.cols = ctx.cols ;
					selectinput5_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput5_updating.changedParams && changed.changedParams) {
					selectinput5_changes.changedParams = ctx.changedParams ;
					selectinput5_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput5._set(selectinput5_changes);
				selectinput5_updating = {};

				var selectinput6_changes = {};
				if (!selectinput6_updating.params && changed.params) {
					selectinput6_changes.params = ctx.params ;
					selectinput6_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput6_updating.cols && changed.cols) {
					selectinput6_changes.cols = ctx.cols ;
					selectinput6_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput6_updating.changedParams && changed.changedParams) {
					selectinput6_changes.changedParams = ctx.changedParams ;
					selectinput6_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput6._set(selectinput6_changes);
				selectinput6_updating = {};

				var selectinput7_changes = {};
				if (!selectinput7_updating.params && changed.params) {
					selectinput7_changes.params = ctx.params ;
					selectinput7_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput7_updating.cols && changed.cols) {
					selectinput7_changes.cols = ctx.cols ;
					selectinput7_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput7_updating.changedParams && changed.changedParams) {
					selectinput7_changes.changedParams = ctx.changedParams ;
					selectinput7_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput7._set(selectinput7_changes);
				selectinput7_updating = {};

				if ((!current || changed.params) && text20_value !== (text20_value = ctx.params.scale.title || ctx.params.scale.value)) {
					setData(text20, text20_value);
				}

				if ((!current || changed.params) && text33_value !== (text33_value = ctx.params.quadrantLayerId.title || ctx.params.quadrantLayerId.value)) {
					setData(text33, text33_value);
				}

				if (ctx.quadrantIds) {
					if (if_block1) {
						if_block1.p(changed, ctx);
					} else {
						if_block1 = create_if_block_2(component, ctx);
						if_block1.c();
						if_block1.m(select2, null);
					}
				} else if (if_block1) {
					if_block1.d(1);
					if_block1 = null;
				}

				if ((!current || changed.drawstart) && text38_value !== (text38_value = ctx.drawstart ? 'Полигон рисуется' :'Выделите участки полигоном')) {
					setData(text38, text38_value);
				}

				if ((!current || changed.Object || changed.checked) && text41_value !== (text41_value = ctx.Object.keys(ctx.checked).length)) {
					setData(text41, text41_value);
				}

				if ((!current || changed.layerItems) && text43_value !== (text43_value = ctx.layerItems.length)) {
					setData(text43, text43_value);
				}

				var table_changes = {};
				if (changed.layerItems) { table_changes.items = ctx.layerItems; }
				if (changed.hashCols) { table_changes.hashCols = ctx.hashCols; }
				if (!table_updating.checked && changed.checked) {
					table_changes.checked = ctx.checked ;
					table_updating.checked = ctx.checked  !== void 0;
				}
				table._set(table_changes);
				table_updating = {};

				if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block2) {
					if_block2.p(changed, ctx);
				} else {
					if_block2.d(1);
					if_block2 = current_block_type(component, ctx);
					if_block2.c();
					if_block2.m(div18, null);
				}
			},

			i: function i(target, anchor) {
				if (current) { return; }

				this.m(target, anchor);
			},

			o: function o(outrocallback) {
				if (!current) { return; }

				outrocallback = callAfter(outrocallback, 10);

				if (if_block0) { if_block0.o(outrocallback); }
				else { outrocallback(); }

				if (selectinput0) { selectinput0._fragment.o(outrocallback); }
				if (selectinput1) { selectinput1._fragment.o(outrocallback); }
				if (selectinput2) { selectinput2._fragment.o(outrocallback); }
				if (selectinput3) { selectinput3._fragment.o(outrocallback); }
				if (selectinput4) { selectinput4._fragment.o(outrocallback); }
				if (selectinput5) { selectinput5._fragment.o(outrocallback); }
				if (selectinput6) { selectinput6._fragment.o(outrocallback); }
				if (selectinput7) { selectinput7._fragment.o(outrocallback); }
				if (table) { table._fragment.o(outrocallback); }
				current = false;
			},

			d: function d(detach) {
				if (detach) {
					detachNode(div19);
				}

				destroyEach(each_blocks, detach);

				removeListener(select0, "change", change_handler);
				if (component.refs.reportType === select0) { component.refs.reportType = null; }
				if (if_block0) { if_block0.d(); }
				removeListener(input0, "change", change_handler_1);
				if (component.refs.organizationName === input0) { component.refs.organizationName = null; }
				removeListener(input1, "change", change_handler_2);
				if (component.refs.inn === input1) { component.refs.inn = null; }
				selectinput0.destroy();
				selectinput1.destroy();
				selectinput2.destroy();
				selectinput3.destroy();
				selectinput4.destroy();
				selectinput5.destroy();
				selectinput6.destroy();
				selectinput7.destroy();
				removeListener(select1, "change", change_handler_3);
				if (component.refs.scale === select1) { component.refs.scale = null; }
				if (if_block1) { if_block1.d(); }
				removeListener(select2, "change", change_handler_4);
				if (component.refs.quadrantLayerId === select2) { component.refs.quadrantLayerId = null; }
				removeListener(button, "click", click_handler);
				table.destroy();
				if_block2.d();
			}
		};
	}

	// (184:0) {#each params.reportType.options as it}
	function create_each_block_1(component, ctx) {
		var option, text_value = ctx.it, text, option_value_value;

		return {
			c: function c() {
				option = createElement("option");
				text = createText(text_value);
				option.__value = option_value_value = ctx.it;
				option.value = option.__value;
				option.className = "svelte-qidupr";
			},

			m: function m(target, anchor) {
				insert(target, option, anchor);
				append(option, text);
			},

			p: function p(changed, ctx) {
				if ((changed.params) && text_value !== (text_value = ctx.it)) {
					setData(text, text_value);
				}

				if ((changed.params) && option_value_value !== (option_value_value = ctx.it)) {
					option.__value = option_value_value;
				}

				option.value = option.__value;
			},

			d: function d(detach) {
				if (detach) {
					detachNode(option);
				}
			}
		};
	}

	// (190:0) {#if reportType !== 'о воспроизводстве лесов'}
	function create_if_block_3(component, ctx) {
		var div, selectinput0_updating = {}, text, selectinput1_updating = {}, current;

		var selectinput0_initial_data = { key: "fellingForm" };
		if (ctx.params  !== void 0) {
			selectinput0_initial_data.params = ctx.params ;
			selectinput0_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput0_initial_data.cols = ctx.cols ;
			selectinput0_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput0_initial_data.changedParams = ctx.changedParams ;
			selectinput0_updating.changedParams = true;
		}
		var selectinput0 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput0_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput0_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput0_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput0_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput0_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput0._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput0.get());
		});

		var selectinput1_initial_data = { key: "fellingType" };
		if (ctx.params  !== void 0) {
			selectinput1_initial_data.params = ctx.params ;
			selectinput1_updating.params = true;
		}
		if (ctx.cols  !== void 0) {
			selectinput1_initial_data.cols = ctx.cols ;
			selectinput1_updating.cols = true;
		}
		if (ctx.changedParams  !== void 0) {
			selectinput1_initial_data.changedParams = ctx.changedParams ;
			selectinput1_updating.changedParams = true;
		}
		var selectinput1 = new SelectInput({
			root: component.root,
			store: component.store,
			data: selectinput1_initial_data,
			_bind: function _bind(changed, childState) {
				var newState = {};
				if (!selectinput1_updating.params && changed.params) {
					newState.params = childState.params;
				}

				if (!selectinput1_updating.cols && changed.cols) {
					newState.cols = childState.cols;
				}

				if (!selectinput1_updating.changedParams && changed.changedParams) {
					newState.changedParams = childState.changedParams;
				}
				component._set(newState);
				selectinput1_updating = {};
			}
		});

		component.root._beforecreate.push(function () {
			selectinput1._bind({ params: 1, cols: 1, changedParams: 1 }, selectinput1.get());
		});

		return {
			c: function c() {
				div = createElement("div");
				selectinput0._fragment.c();
				text = createText("\r\n\t\t\t\t\t\t");
				selectinput1._fragment.c();
			},

			m: function m(target, anchor) {
				insert(target, div, anchor);
				selectinput0._mount(div, null);
				append(div, text);
				selectinput1._mount(div, null);
				current = true;
			},

			p: function p(changed, _ctx) {
				ctx = _ctx;
				var selectinput0_changes = {};
				if (!selectinput0_updating.params && changed.params) {
					selectinput0_changes.params = ctx.params ;
					selectinput0_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput0_updating.cols && changed.cols) {
					selectinput0_changes.cols = ctx.cols ;
					selectinput0_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput0_updating.changedParams && changed.changedParams) {
					selectinput0_changes.changedParams = ctx.changedParams ;
					selectinput0_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput0._set(selectinput0_changes);
				selectinput0_updating = {};

				var selectinput1_changes = {};
				if (!selectinput1_updating.params && changed.params) {
					selectinput1_changes.params = ctx.params ;
					selectinput1_updating.params = ctx.params  !== void 0;
				}
				if (!selectinput1_updating.cols && changed.cols) {
					selectinput1_changes.cols = ctx.cols ;
					selectinput1_updating.cols = ctx.cols  !== void 0;
				}
				if (!selectinput1_updating.changedParams && changed.changedParams) {
					selectinput1_changes.changedParams = ctx.changedParams ;
					selectinput1_updating.changedParams = ctx.changedParams  !== void 0;
				}
				selectinput1._set(selectinput1_changes);
				selectinput1_updating = {};
			},

			i: function i(target, anchor) {
				if (current) { return; }

				this.m(target, anchor);
			},

			o: function o(outrocallback) {
				if (!current) { return; }

				outrocallback = callAfter(outrocallback, 2);

				if (selectinput0) { selectinput0._fragment.o(outrocallback); }
				if (selectinput1) { selectinput1._fragment.o(outrocallback); }
				current = false;
			},

			d: function d(detach) {
				if (detach) {
					detachNode(div);
				}

				selectinput0.destroy();
				selectinput1.destroy();
			}
		};
	}

	// (233:0) {#if quadrantIds}
	function create_if_block_2(component, ctx) {
		var each_anchor;

		var each_value_2 = ctx.quadrantIds;

		var each_blocks = [];

		for (var i = 0; i < each_value_2.length; i += 1) {
			each_blocks[i] = create_each_block$2(component, get_each_context_2(ctx, each_value_2, i));
		}

		return {
			c: function c() {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].c();
				}

				each_anchor = createComment();
			},

			m: function m(target, anchor) {
				for (var i = 0; i < each_blocks.length; i += 1) {
					each_blocks[i].m(target, anchor);
				}

				insert(target, each_anchor, anchor);
			},

			p: function p(changed, ctx) {
				if (changed.quadrantIds) {
					each_value_2 = ctx.quadrantIds;

					for (var i = 0; i < each_value_2.length; i += 1) {
						var child_ctx = get_each_context_2(ctx, each_value_2, i);

						if (each_blocks[i]) {
							each_blocks[i].p(changed, child_ctx);
						} else {
							each_blocks[i] = create_each_block$2(component, child_ctx);
							each_blocks[i].c();
							each_blocks[i].m(each_anchor.parentNode, each_anchor);
						}
					}

					for (; i < each_blocks.length; i += 1) {
						each_blocks[i].d(1);
					}
					each_blocks.length = each_value_2.length;
				}
			},

			d: function d(detach) {
				destroyEach(each_blocks, detach);

				if (detach) {
					detachNode(each_anchor);
				}
			}
		};
	}

	// (234:1) {#each quadrantIds as it}
	function create_each_block$2(component, ctx) {
		var option, text_value = ctx.it.title, text, option_value_value;

		return {
			c: function c() {
				option = createElement("option");
				text = createText(text_value);
				option.__value = option_value_value = ctx.it.id;
				option.value = option.__value;
				option.className = "svelte-qidupr";
			},

			m: function m(target, anchor) {
				insert(target, option, anchor);
				append(option, text);
			},

			p: function p(changed, ctx) {
				if ((changed.quadrantIds) && text_value !== (text_value = ctx.it.title)) {
					setData(text, text_value);
				}

				if ((changed.quadrantIds) && option_value_value !== (option_value_value = ctx.it.id)) {
					option.__value = option_value_value;
				}

				option.value = option.__value;
			},

			d: function d(detach) {
				if (detach) {
					detachNode(option);
				}
			}
		};
	}

	// (253:0) {:else}
	function create_else_block$1(component, ctx) {
		var button, text, button_class_value;

		function click_handler(event) {
			component.sendReport();
		}

		return {
			c: function c() {
				button = createElement("button");
				text = createText("Создать отчеты");
				addListener(button, "click", click_handler);
				button.className = button_class_value = "gmx-sidebar-button" + (ctx.Object.keys(ctx.checked).length ? '' : '-disabled') + " svelte-qidupr";
			},

			m: function m(target, anchor) {
				insert(target, button, anchor);
				append(button, text);
			},

			p: function p(changed, ctx) {
				if ((changed.Object || changed.checked) && button_class_value !== (button_class_value = "gmx-sidebar-button" + (ctx.Object.keys(ctx.checked).length ? '' : '-disabled') + " svelte-qidupr")) {
					button.className = button_class_value;
				}
			},

			d: function d(detach) {
				if (detach) {
					detachNode(button);
				}

				removeListener(button, "click", click_handler);
			}
		};
	}

	// (251:0) {#if report}
	function create_if_block_1(component, ctx) {
		var button;

		return {
			c: function c() {
				button = createElement("button");
				button.innerHTML = "<div class=\"lds-ellipsis svelte-qidupr\"><div class=\"svelte-qidupr\"></div><div class=\"svelte-qidupr\"></div><div class=\"svelte-qidupr\"></div><div class=\"svelte-qidupr\"></div></div>";
				button.className = "gmx-sidebar-button-disabled svelte-qidupr";
			},

			m: function m(target, anchor) {
				insert(target, button, anchor);
			},

			p: noop,

			d: function d(detach) {
				if (detach) {
					detachNode(button);
				}
			}
		};
	}

	function App(options) {
		var this$1 = this;

		init(this, options);
		this.refs = {};
		this._state = assign(assign({ Object : Object }, data$2()), options.data);
		this._intro = !!options.intro;

		this._handlers.state = [onstate$1];
		this._handlers.update = [onupdate];

		onstate$1.call(this, { changed: assignTrue({}, this._state), current: this._state });

		this._fragment = create_main_fragment$2(this, this._state);

		this.root._oncreate.push(function () {
			this$1.fire("update", { changed: assignTrue({}, this$1._state), current: this$1._state });
		});

		if (options.target) {
			this._fragment.c();
			this._mount(options.target, options.anchor);

			flush(this);
		}

		this._intro = true;
	}

	assign(App.prototype, proto);
	assign(App.prototype, methods$2);

	exports.App = App;

	return exports;

}({}));
//# sourceMappingURL=gmxForest.js.map
