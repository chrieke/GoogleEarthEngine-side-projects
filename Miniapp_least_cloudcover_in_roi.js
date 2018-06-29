/*{*********************************************************************
* Miniapp: roi cloudcover 5/7/8
* Calculate fmask cloudcover score inside an roi.
***********************************************************************/

// TODO: 
// add app namespace
// add dates/roi selection

/**********************************************************************
*                         Input data                         
***********************************************************************/

// Select region of interest
var roi = /* color: d63000 */ee.Geometry.Polygon(
        [[[10.4644775390625, 51.17759467314004],
          [10.43975830078125, 50.83887470777369],
          [11.76910400390625, 50.840609151331336],
          [11.7279052734375, 51.17759467314004]]]);
var roi_paint = (ee.Image().byte()).paint(roi, 1, 3)
Map.centerObject(roi, 9);

// Adjust different Landsat sensor collections (Surface Reflectance SR) to Landsat 8 band schema
var my_filter = function(collection){
  return collection
    .filterDate('2015-01-01', '2016-01-01')
    .filterBounds(roi)
}
var LS8  = my_filter(ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
                      .select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'pixel_qa']))
var LS7 = my_filter(ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
                      .select(['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'pixel_qa'], ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'pixel_qa']))
var LS5 = my_filter(ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
                      .select(['B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'pixel_qa'], ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'pixel_qa']))
var LS875 = ee.ImageCollection((LS8).merge(LS7).merge(LS5))
              .sort('system:time_start', true)

var colors = ['777777', '0000FF', '000000', '00FFFF', 'FFFFFF']
var names = ['CLEAR', 'WATER', 'SHADOW', 'SNOW', 'CLOUD']

                
/**********************************************************************
*                 Calculation & Widget Interaction                         
***********************************************************************/

var update_result = function(value) {
  
  // Display SR image.
  var LS875_img = ee.Image(LS875.toList({count: 1, offset: value}).get(0));
  var layer1 = ui.Map.Layer(LS875_img.divide(10000), {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3}, 'SR_img');
  Map.layers().set(0, layer1);
  
  // Build and display cloud mask.
  var qa = ee.Image(LS875_img.select('pixel_qa'))

  var clear = qa.bitwiseAnd(2).neq(0);
  var water = qa.bitwiseAnd(4).neq(0).remap([0,1], [0,2]);
  var cloud_shadow = qa.bitwiseAnd(8).neq(0).remap([0,1], [0,3]);  // 8 because 2 hoch 3 or ee.Number(2).pow(3).int()
  var snow = qa.bitwiseAnd(16).neq(0).remap([0,1], [0,4]);
  var cloud = qa.bitwiseAnd(32).neq(0).remap([0,1], [0,5])

  var LS875_fmask = ee.Image(clear.add(water).add(cloud_shadow).add(snow).add(cloud)
                      .clamp(1,5) // snow and cloud have overlapping bit value specifications, makes sure these values are assigned to cloud.
                      .copyProperties(qa))
  var viz_fmask = {
    min:1,
    max:5,
    palette: colors
  };
  var layer2 = ui.Map.Layer(LS875_fmask, viz_fmask, 'fmask');
  Map.layers().set(1, layer2);
  

  // Calculate cloudcover parameters inside roi.
  // - Handles Landsat 7 scanlines area correctly
  // - Uses area of pixel image instead of image boundary feature to avoid projection issues.
  
  
  // Calculate area of overlap of roi and image.
  var overlap_fmask = ee.Image(LS875_fmask)
                    .clip(roi)

  var area_overlap = ee.Image.pixelArea().mask(overlap_fmask);
  var overlap = area_overlap.reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: roi,
        scale: 30,
        maxPixels: 5e9
        //bestEffort: bestEffort
  });
  overlap = ee.Number(overlap.get('area')).divide(1000000);
  var roi_area = ee.Number(roi.area()).divide(1000000) // all values in sqkm
  var overlap_index = overlap.divide(roi_area).multiply(100);
  
  // Calculate area of clouds in roi for image.
  var cloudarea_fmask = LS875_fmask.mask(LS875_fmask.eq(5));
  var layer3 = ui.Map.Layer(cloudarea_fmask.clip(roi), {palette: 'ff0000'}, 'clouds in roi');
  Map.layers().set(2, layer3);
  
  var area_cloudarea = ee.Image.pixelArea().mask(cloudarea_fmask); //needs scale in the reducer.
  var cloudarea = area_cloudarea.reduceRegion({
        reducer: ee.Reducer.sum(),
        geometry: roi,
        scale: 30,
        maxPixels: 5e9
        //bestEffort: bestEffort
  });
  cloudarea = ee.Number(cloudarea.get('area')).divide(1000000);
  var cloudarea_index = cloudarea.divide(overlap).multiply(100);
  //print('cloudarea0_index, 100=all clouds, 0=no clouds', cloudarea0_index) //100 = all clouds, 0=no clouds.
  

  // Display results in widgets.
  // Set slider maximum length value.
  LS875.size().evaluate(function(result) {
    slider.setMax(result-1);
  });

  var acqdate = LS875_fmask.get('DATE_ACQUIRED');
  acqdate.evaluate(function(result) {
    panel_results.widgets().set(0, ui.Label({
      value: result,
      style: {color: '#FF0000'}
    }));
  });
  
  var scene_meta = ee.List([LS875_fmask.get('LANDSAT_ID'),
                          LS875_fmask.get('CLOUD_COVER')])
  scene_meta.evaluate(function(result) {
    panel_results.widgets().set(0, ui.Label({
      value: result[0],
      style: {},
    }));
    panel_results.widgets().set(5, ui.Label({
      value: 'scene metadata cloud cover: ' + result[1] + ' %',
      style: {},
    }));
  });  
  
  ee.List([cloudarea_index, cloudarea]).evaluate(function(result) {
    panel_results.widgets().set(2, ui.Label({
      value: 'cloudy area inside roi: ' + result[0].toFixed(2) + ' %     /     ' + result[1].toFixed(2) + ' sqkm',
      style:  {fontWeight: 'bold', color: '#FF0000'}
    }));
  });
  
  ee.List([overlap_index, overlap]).evaluate(function(result) {
    panel_results.widgets().set(3, ui.Label({
      value: 'overlap roi and scene: ' + result[0].toFixed(2) + ' %     /     ' + result[1].toFixed(2) + ' sqkm',
      style:  {}
    }));
  });
};


/**********************************************************************
*                 Panel & Interface                         
***********************************************************************/

var slider = ui.Slider({
  min: 0,
  max: 100,
  step: 1,
  onChange: update_result,
  style: {stretch: 'horizontal'}
});
var panel_selection = ui.Panel({
  widgets: [ui.Label('Choose scene of collection (sorted by date):'), slider],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {
    position: 'top-right',
    padding: '3px'
  }
});

var panel_results = ui.Panel({
  widgets: [ui.Label(''), ui.Label(''), ui.Label('cloudy area inside roi:'), 
            ui.Label('overlap roi and scene:'), ui.Label(''), ui.Label('metadata cloud cover:')],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {
    position: 'top-right',
    padding: '3px',
  }
});

var panel_master = ui.Panel({
  widgets: [panel_selection, panel_results],
  layout: ui.Panel.Layout.flow('vertical'),
  style: {
    height: '270px',
    width: '400px',
    margin: '+8px',
    position: 'bottom-right',
    padding: '6px',
    fontSize: '16px'
  }
});
Map.add(panel_master);

// Set default values on the slider to kick off the initial calculation.
slider.setValue(1);


/**********************************************************************
// *                 Legend                                
// ***********************************************************************/

var panel_legend = ui.Panel({
  widgets: [ui.Label({
              value: 'fmask Legend',
              style: {
                fontWeight: 'bold',
                fontSize: '18px',
                margin: '0 0 4px 0',
                padding: '0'
            }})],
  style: {
    position: 'bottom-left',
    padding: '8px 15px'
  }});

var makeRow = function(color, name) {
  // Create the label that is actually the colored box.
  var colorBox = ui.Label({
    style: {
      backgroundColor: '#' + color,
      padding: '8px', // Use padding to give the box height and width.
      margin: '0 0 4px 0'
    }});
  // Create the label filled with the description text.
  var description = ui.Label({
    value: name,
    style: {margin: '0 0 4px 6px'}
  });
  
  return ui.Panel({
    widgets: [colorBox, description],
    layout: ui.Panel.Layout.Flow('horizontal')
  });
};


for (var i = 0; i<colors.length; i++){
  panel_legend.add(makeRow(colors[i], names[i]));
}
Map.add(panel_legend);

Map.addLayer(roi_paint, {palette: 'FF0000'}, 'roi');
