L.Control.gmxTreeView  = L.Evented.extend({
	includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
    options: {
        id: 'treeView',
        position: 'right'
    },
	initialize: function (options) {
		L.setOptions(this, options);
		options.iconSidebar.on('opened', function(e) {
			console.log(e); // true
			if (e.id === this.options.id) {
console.log(e); // true
				this._initTree();
			}
		}, this);
		this._gmxMapManager = this.options.gmxMapManager || L.gmx.gmxMapManager;

console.log('ssssssss', this.options);
	},
    _setSVGIcon: function(node, id) {
		node.innerHTML = '<svg role="img" class="svgIcon"><use xlink:href="#' + id + '" href="#' + id + '"></use></svg>';
    },
    _setStyleIcon: function(st, geometryType, contentLegend) {		// отрисовка иконок легенды стилей
		var iconClass = 'layersTreeWidget-contentView-icon layersTreeWidget-contentView-activeArea',
			styleNode;
		if (st.iconUrl) {
			styleNode = L.DomUtil.create('span', 'legendIconStyleImage',
				L.DomUtil.create('span', 'legendIconCell', contentLegend));
			var img = new Image();
			img.crossorigin = '';
			img.src = st.iconUrl;
			styleNode.appendChild(img);
		} else {
			styleNode = L.DomUtil.create('span', 'legendIconStyle',
				L.DomUtil.create('span', 'legendIconCell style', contentLegend));
			L.DomUtil.addClass(styleNode, geometryType);
			if (st.fillColor) {
				styleNode.style.backgroundColor = L.gmxUtil.dec2rgba(st.fillColor, st.fillOpacity || 1);
			}
			if (st.color) {
				styleNode.style.borderColor = L.gmxUtil.dec2rgba(st.color, st.opacity || 1);
			}
		}
		return styleNode;
    },
    _getTreeNodeById: function(id, node) {
		node = node || this.options.rawTree;
		var props = node.properties,
			arr = node.children;
		if (props.GroupID === id || props.name === id) {
			return node;
		} else if (arr && arr.length) {
            for (var i = 0, len = arr.length; i < len; i++) {
                var res = this._getTreeNodeById(id, arr[i].content);
				if (res) {return res;}
			}
		}
		return null;
    },
    _getNodeForEvent: function(node) {
		for(var i = 0, prnt = node.parentNode; i < 20; i++, prnt = prnt.parentNode) {
			if (prnt) {
				if (prnt.tagName.toUpperCase() === 'LI') {
					return prnt;
				}
			}
		}
		return null;
	},
    _triggerEvent: function(ev) {
		var target = ev.target,
			node = this._getNodeForEvent(target),
			nodeID = '',
			attr = {originalEvent: ev},
			evName = 'click';

		if (node) {
			nodeID = node.className.replace('node-', '');
			attr.treeNodeID = nodeID;
		}

		if (L.DomUtil.hasClass(target, 'cont-center')) {
			evName = 'centerLayer';
		} else if (L.DomUtil.hasClass(target, 'cont-info')) {
			evName = 'infoLayer';
		} else if (L.DomUtil.hasClass(target, 'cont-overlays')) {
			evName = 'styles:click';
		} else if (L.DomUtil.hasClass(target, 'title')) {
			evName = 'title:click';
		} else if (L.DomUtil.hasClass(target, 'expander')) {
			evName = 'change:expanded';
			attr.checked = target.checked;
		} else if (L.DomUtil.hasClass(target, 'visible')) {
			evName = 'change:visible';
			attr.checked = target.checked;
		}

		attr.treeNode = this._getTreeNodeById(nodeID);
		this.fire(evName, attr);
// console.log('_triggerEvent', ev.type, target.tagName);
    },
    _addLegend: function(props, parentNode) {
		var geometryType = props.GeometryType,
			styles = props.gmxStyles.styles;

		styles.forEach(function(it, i) {
			var st = it.RenderStyle;
			if (st) {
				var contentLegend = L.DomUtil.create('div', 'gmx-style-legend', parentNode),
					eye = L.DomUtil.create('span', 'legendIconEye ' + (st.disabled ? 'disabled' : 'enabled'), contentLegend);
				this._setSVGIcon(eye, 'eye-' + (it.disabled ? 'off' : 'on'));
				L.DomEvent.on(eye, 'click', function (ev) {
					it.disabled = !it.disabled;
					this._setSVGIcon(eye, 'eye-' + (it.disabled ? 'off' : 'on'));
					this.fire('style:click', {treeNodeID: props.name, styleNum: i, style: it, originalEvent: ev});
				}.bind(this))

				this._setStyleIcon(st, geometryType, contentLegend);
				var title = L.DomUtil.create('span', 'styleName',
					L.DomUtil.create('span', 'legendIconCell', contentLegend));
				title.innerHTML = it.Name || it.Filter;
			}
		}.bind(this));
    },
    _addLine: function(props, type) {
		var id = props ? props.GroupID || props.name : 'root',
			node = L.DomUtil.create('li', 'node-' + id);
			
		if (props) {
			var styles = props.gmxStyles ? props.gmxStyles.styles : [],
				showCheckbox = props.ShowCheckbox || type === 'layer' ? '' : 'hidden',
				groupClass = type === 'layer' && styles.length > 1 ? '' : 'hidden',
				borders = L.DomUtil.create('div', 'borders', node),
				input = L.DomUtil.create('input', 'expander', node),
				expander = L.DomUtil.create('span', 'expander ' + (type === 'layer' ? 'hidden' : ''), node),
				
				contOverlays = L.DomUtil.create('span', 'cont-overlays ' + groupClass, node),
				icons = L.DomUtil.create('span', 'icons ' + groupClass, node),
				center = L.DomUtil.create('span', 'cont-center', icons),
				info = L.DomUtil.create('span', 'cont-info ' + (props.description ? '' : 'hidden'), icons),
				cont = L.DomUtil.create('span', 'cont', node),
				
				inputCheck = L.DomUtil.create('input', 'check visible ' + showCheckbox, cont),
				label = L.DomUtil.create('label', 'title', cont),
				legend = L.DomUtil.create('div', 'legend ' + groupClass, cont);

			input.type = inputCheck.type = 'checkbox';
			input.checked = props.expanded;
			inputCheck.checked = props.visible;
			label.innerHTML = props.title;

			this._setSVGIcon(contOverlays, 'overlays');
			this._setSVGIcon(center, 'transparency');
			this._setSVGIcon(info, 'info-circle-i');
			L.DomEvent.on(contOverlays, 'click', this._triggerEvent, this);
			L.DomEvent.on(label, 'click', this._triggerEvent, this);
			L.DomEvent.on(center, 'click', this._triggerEvent, this);	center.title = 'Move map to this layer';
			L.DomEvent.on(info, 'click', this._triggerEvent, this);		info.title = 'View description';
			L.DomEvent.on(input, 'change', this._triggerEvent, this);
			L.DomEvent.on(inputCheck, 'change', this._triggerEvent, this);
			if (type === 'layer' && inputCheck.checked) {
				this._addLegend(props, legend);
				this.fire('change:visible', {treeNodeID: props.name, checked: inputCheck.checked, treeNode: node});
			}
		}
		return node;
	},
    _addGroupNode: function(tItem) {
		var type = tItem.type,
			props = tItem.content.properties,
			id = props ? props.GroupID || props.name : 'root',
			tNode = L.DomUtil.create('ul', 'css-treeview node-props-' + id),
			node = this._addLine(props, type);
		
		// if (props) {		// без свойств карты
			tNode.appendChild(node);
		// }

		if (tItem.content.children) {	// могут быть потомки
            for (var i = 0, len = tItem.content.children.length; i < len; i++) {
				node.appendChild(this._addGroupNode(tItem.content.children[i]));
            }
		}
		return tNode;
//		var content = it.content,
		//var grp = L.DomUtil.create('ul', 'css-treeview node-root', prntNode);

	},
    _initTree: function() {
		this._tree = this._addGroupNode({
			type: 'group',
			content: {
				children: this.options.rawTree.children
			}
		});
        this.options.container.innerHTML = '';
        this.options.container.appendChild(this._tree);
    }
});

L.control.gmxTreeView = function(options) {
    return new L.Control.gmxTreeView(options);
};
