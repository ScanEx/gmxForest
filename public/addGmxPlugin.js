(function () {
    'use strict';

	window.nsGmx = window.nsGmx || {};

    var publicInterface = {
        pluginName: 'gmxForest',
        params: {},
		map: null,		// текущая карта
        path: '',		// папка плагина
		locale: window.language === 'eng' ? 'en' : 'ru',

        afterViewer: function (params, map) {
// console.log('afterViewer', params, map)
			publicInterface.params = params;
			publicInterface.map = map;

			map.gmxControlsManager.setSvgSprites('//maps.kosmosnimki.ru/api/plugins/forestproject/icons/sprite.svg');
			map.gmxControlsManager.setSvgSprites('//www.kosmosnimki.ru/lib/geomixer_1.3/img/svg-symbols2.svg');
			publicInterface.load();
		},
        load: function() {
			var prefix = publicInterface.path + publicInterface.pluginName;
			Promise.all([
				prefix + '.js',
				prefix + '.css',
				publicInterface.path + 'global.css'
			].map(function(href) {
console.log('load', href)
				return L.gmxUtil.requestLink(href);
			})).then(function() {
			
				var iconSidebar =  window.iconSidebarWidget,
					createTabFunction = window.createTabFunction;
console.log('load______', iconSidebar)
				if (iconSidebar) {
					var menuId = 'forestView',
						node = null,
						treePane = iconSidebar.setPane(menuId, { createTab: createTabFunction({
								icon: 's-forest-plugin',
								hint: 'Legend'
							})
						}),
						toggle = function(flag) {
							//var flag = e.id === menuId;
							// console.log('toggle', flag); // true
							if (flag) {
								if (!node) {
									node = L.DomUtil.create('div', 'forestViewCont');
									var hworld = new gmxForest.App({
										target: node,
										data: {
											// meta: true,		// фильтровать списки слоев по Meta
											map: publicInterface.map,
											gmxMap: nsGmx.gmxMap
											,
											// layerId: 'F2EE4C559F614CDFA058D34FE3E4703E',	// слой делянок по умолчанию
											quadrantId: '4CEAA401E3D540EEBD37AD6F01F06CF5'	// слой квадрантов по умолчанию
											
										}
									});
								}
								treePane.appendChild(node);
							} else if (node.parentNode) {
								node.parentNode.removeChild(node);
							}
						};
					// iconSidebar.on('opened', toggle.bind(this));
					// iconSidebar.on('closed', toggle.bind(this));
					// iconSidebar.on('closing', toggle.bind(this));
						
					iconSidebar.addEventListener('opened', function(e) {
						if (e.detail.id === menuId) { toggle(true); }
					}.bind(this));
					iconSidebar.addEventListener('closed', function(e) {
						toggle();
					}.bind(this));
					iconSidebar.addEventListener('closing', function(e) {
						toggle();
					}.bind(this));
				}
			}.bind(this));
		},
        unload: function() {
            var lmap = window.nsGmx.leafletMap,
                gmxControlsManager = lmap.gmxControlsManager,
                control = gmxControlsManager.get(publicInterface.pluginName);

			gmxControlsManager.remove(control);
		}
    };

    var pluginName = publicInterface.pluginName;
	if (window.gmxCore) {
		publicInterface.path = gmxCore.getModulePath(pluginName);
        window.gmxCore.addModule(pluginName, publicInterface, {});
	} else {
		window.nsGmx[pluginName] = publicInterface;
	}
})();
