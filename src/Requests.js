const serverBase = window.serverBase || '//maps.kosmosnimki.ru/';

const chkTask = id => {
	const UPDATE_INTERVAL = 2000;
	return new Promise((resolve, reject) => {
		let interval = setInterval(() => {
			fetch(`${serverBase}AsyncTask.ashx?WrapStyle=None&TaskID=${id}`,
			{
				mode: 'cors',
				credentials: 'include'
			})
				.then(res => res.json())
				.then(json => {
					const { Completed, ErrorInfo } = json.Result;
					if (ErrorInfo) {
						clearInterval(interval);
						reject(json);
					} else if (Completed) {
						clearInterval(interval);
						resolve(json);
					}
				})
				.catch(err => console.warn(err));
		}, UPDATE_INTERVAL);
	});
};

const modifyVectorObjects = (layerId, features) => {
	console.log('modifyVectorObjects ____ ', layerId, features);
	const params = {
		WrapStyle: 'None',
		LayerName : layerId,
		Objects: JSON.stringify(features)
	};

	return fetch(`${serverBase}VectorLayer/ModifyVectorObjects.ashx?${L.gmxUtil.getFormData(params)}`, {
		mode: 'cors',
		credentials: 'include',
		headers: {
			'Accept': 'application/json'
		}
	})
		.then(res => res.json())
		.catch(err => console.warn(err));
};

const getReportsCount = () => {
	return fetch(`${serverBase}plugins/forestreport/rest/GetCurrentUserInfo?WrapStyle=None`, {
			mode: 'cors',
			credentials: 'include'
		})
		.then(res => res.json())
		.catch(err => console.warn(err));
};

const loadFeatures = id => {
	return fetch(`${serverBase}VectorLayer/Search.ashx?layer=${id}&geometry=true&out_cs=EPSG:4326&WrapStyle=None`, {
			mode: 'cors',
			credentials: 'include'
		})
		.then(res => res.json())
		.catch(err => console.warn(err));
};

const selectFeaturesWithDrawing = (id, geometry) => {
	const params = {
		WrapStyle: 'None',
		layer: id,
		columns: '[{"Value":"[gmx_id]"}]',
		page: 0,
		// pagesize: null,
		query: `STIntersects([gmx_geometry], GeometryFromGeoJson('${JSON.stringify(geometry)}', 4326))`
	};

	return fetch(`${serverBase}VectorLayer/Search.ashx?${L.gmxUtil.getFormData(params)}`, {
		mode: 'cors',
		credentials: 'include',
		headers: {
			'Accept': 'application/json'
		}
	})
	.then(res => res.json())
	.then(json => {
		if (json.Status === 'ok' && json.Result) {
			return json.Result.values.reduce((a, v) => {
				a[v] = true;
				return a;
			}, {});
		}
	})
	.catch(err => console.warn(err))
};

const getLayersParams = (gmxMap) => {
	let satLayers = [];

	gmxMap.layers.forEach((it) => {
		if (it.getGmxProperties && it._map) {
			let props = it.getGmxProperties(),
				metaProps = props.MetaProperties || {},
				out = {layerId: props.name, type: 'оптическая'};
			if (props.IsRasterCatalog || props.type === 'Raster') {
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
		}
	});
	return satLayers;
};

const getLayersIds = (meta, gmxMap) => {
	let layerIds = [], quadrantIds = [], limit = 0;

	gmxMap.layers.forEach((it) => {
		if (it.getGmxProperties) {
			let props = it.getGmxProperties(),
				metaProps = props.MetaProperties || {};
			if (
				props.type.toLowerCase() === 'vector' &&
				props.GeometryType.toLowerCase() === 'polygon' &&
				!props.IsRasterCatalog &&
				!props.Quicklook
				) {
				let hash = {id: props.name, title: props.title};
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

	return getReportsCount().then(json => {
		if (json.Status === 'ok') {
			let count = json.Result.limit - json.Result.used;
			limit = count > 0 ? count : 0;
		}
		return {layerIds, quadrantIds, limit, cols: []};
	});
};

const saveState = data => {
	window.localStorage.setItem('gmxForest_', JSON.stringify(data));
};

const getState = () => {
	return JSON.parse(window.localStorage.getItem('gmxForest_')) || {};
};

const sendReport = (checked, layerItems, hashCols, params, format, layerID, gmxMap, changedParams, num_points, templ, app) => {
	let groupRequest = [],
		features = [],
		satLayers = getLayersParams(gmxMap);

	layerItems.forEach((it) => {
		let id = it[hashCols.gmx_id];
		if (checked[id]) {
			let data = {featureID: id, num_points: num_points, templ: templ};
			for (let key in params) {
				let val = params[key];
				let par = changedParams[key] || {};
				data[key] = typeof(par) === 'string' ? par : par.field ? it[hashCols[par.field]] : par.value || val.value;
			}
			data.satLayers = satLayers;
			groupRequest.push(data);
			features.push({action:'update', id:id, properties:{FRSTAT:2}});
		}
	});
	return fetch(`${serverBase}Plugins/ForestReport/ForestReportImage`, {
			method: 'post',
			headers: {'Content-type': 'application/x-www-form-urlencoded'},
			body: L.gmxUtil.getFormData({WrapStyle: 'None', format: format, groupRequest: groupRequest}),
			mode: 'cors',
			credentials: 'include'
		})
		.then(res => res.json())
		.then(json => {
			if (json.Status === 'ok') {
				saveState(changedParams);
				return chkTask(json.Result.TaskID)
					.then(json => {
						if (json.Status === 'ok') {
							let downloadFile = json.Result.Result.downloadFile;

							window.open(serverBase + downloadFile, '_self');

							modifyVectorObjects(layerID, features).then(function(argv) {
console.log('hhh', layerID, features, arguments);
								app.loadFeatures();
							});
							return {report: false};
						}
					})
					.catch(err => console.warn(err));
			}
		})
		.catch(err => console.warn(err));
};

export {
    sendReport,
    getLayersIds,
    getLayersParams,
    selectFeaturesWithDrawing,
    loadFeatures,
    saveState,
    getState,
    chkTask,
	modifyVectorObjects
};