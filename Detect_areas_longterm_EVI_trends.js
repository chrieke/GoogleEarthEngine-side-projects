/**********************************************************************
*   Identify areas of longterm EVI linear trend and get 
*   the year of strongest change (slope) for each area
***********************************************************************/

var year_start = 2001;
var year_end = 2014;

// Add Thuringia administrative borders  
var roi = ee.FeatureCollection('ft:1yyY17zJ81sHcJadc511oD5_OXtfaAeyqvkm_t-KN');
var roi_paint = ee.Image(0).mask(0).paint(roi, '000000', 3); 
Map.addLayer(roi_paint, {palette: '000000'}, 'roi');
Map.centerObject(roi, 11);

var add_timeband = function(image) {
  return image
    .addBands(image.metadata('system:time_start')
    .divide(1000 * 60 * 60 * 24 * 365 * 14))}; //14 years timeseries

var collection = ee.ImageCollection('MOD13Q1')
  .filterDate(year_start+'-01-01', year_end+'-12-31')
  .map(add_timeband);

// Add linear trend over timeseries.
var trend = collection
              .select(['system:time_start', 'EVI'])
              .reduce(ee.Reducer.linearFit())
              .select('scale')
              .multiply(0.0001) //EVI factor *0.0001
              .clip(roi);

// Get pixels of EVI-changes <0.1and >0.1;
var changes = trend.lte(-0.1).add(trend.gte(0.1));
changes = trend.mask(changes.neq(0));
Map.addLayer(changes, {min: -0.3, max: 0.3, palette: ['B71C1C', 'F44336', 'FFFFFF', '4CAF50', '1B5E20']}, 
    'EVI timeseries lin trend_masked_treshholds');

// Polygonize results.
var vectors = ee.FeatureCollection(changes.int().addBands(trend)
                .reduceToVectors({
                  geometry: roi,
                  scale: 250,
                  geometryType: 'polygon',
                  eightConnected: true,
                  // reduce to mean value and count
                  reducer: ee.Reducer.mean()
                             .combine({reducer2: ee.Reducer.count(), sharedInputs: true})
                })
);

// Apply zone pixel count treshhold.
vectors = vectors.filter(ee.Filter.gte('count', 6));
// Limit to the features with the strongest change.
vectors = vectors.filter(ee.Filter.or
                          (ee.Filter.lte('mean', -0.15), 
                          (ee.Filter.gte('mean', 0.15)))
                        );


/**********************************************************************
*          Derive annual slope (derivative) for each feature                             
***********************************************************************/

var year_plus1 = year_start + 1;
var collections = [];
var EVI_year = [];

while (year_start <= year_end) {
  collections[year_start] = ee.ImageCollection('MOD13Q1')
    .filter(ee.Filter.calendarRange(year_start, year_start, 'year'))
    .map(function(image){return image.clip(vectors)});

  EVI_year[year_start] = collections[year_start]
    .select('EVI')
    .mean()
    .multiply(0.0001);
  
  year_start++;  
}

// Get yearly EVI slope for each pixel, the derivative of the 
// difference line from mean EVI year i to mean EVI year i+1.
var slope = [];
var year_start = year_plus1 - 1; //resets variable
while (year_start < year_end){
  slope[year_start] = (EVI_year[(year_start) + 1].subtract(EVI_year[year_start]))
                            .divide((year_start + 1) - year_start)
                            .set('year', year_start);
  year_start++;
}

// Convert slope to image collection and filter 'empty' images.
var collectionList = ee.ImageCollection(slope).toList(5000);
var listofyears = ee.List.sequence(year_plus1 - 1, year_end - 1); // no slope for 2014!
var imageList = listofyears.map(function(listelement){return collectionList.get(listelement)});
var yearSlope = ee.ImageCollection(imageList);
//print('yearlySlope', yearSlope);

// Visualize annual slopes:
//Map.addLayer(ee.Image(yearSlope.toList(100).get(0)), {min: -0.03, max: 0.03, palette: ['B71C1C', 'FFFFFF', '1B5E20']}, 'Slope 2001-2002');
//Map.addLayer(ee.Image(yearSlope.toList(100).get(1)), {min: -0.03, max: 0.03, palette: ['B71C1C', 'FFFFFF', '1B5E20']}, 'Slope 2002-2003');


/**********************************************************************
*          Get year of strongest slope for each feature                                  
***********************************************************************/

var multiMax = function(feature) {
  // Reduce to mean value the input polygon for each image.
  var means = yearSlope.map(function(image) {
      var x = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: feature.geometry(),
        scale: 250
      });
      
      // Extract the reduced value from the returned dictionary and add it 
      // to the image as property 'mean'.
      return image.set('mean', x.get('EVI'));
  });

  // Take max over time. Return the system index along with the mean value so we know the 
  // image name where the max is.
  var max = means.reduceColumns({
    reducer: ee.Reducer.max(2),
    selectors: ['mean', 'system:index']
  });

  return feature.set('max', max);
};

// Map the function over all of the filtered vectors.
// Adds properties 'max' (maximum annual value and 'max1' (the respective year)
var maxes = vectors.map(multiMax);
print('maxes- Features and their corresponding year with maximal annual EVI change >= +- 0.15', maxes);

// Display maximal annual EVI change:
Map.addLayer(maxes, {}, 'maxes');

Export.table(maxes, 'maxes', {fileFormat: 'kml'});