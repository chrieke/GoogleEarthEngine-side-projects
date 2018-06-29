/**********************************************************************
*  Calculate annual degree growing days maps for the USA from gridmet data
***********************************************************************/

var years = [1980, 1981, 1982]

var countries = ee.FeatureCollection('ft:1tdSwUL7MVpOauSgRzqVTOwdfy17KDbw-1d9omPw');
var usa = countries.filter(ee.Filter.eq('Country', 'United States'));
Map.centerObject(usa, 4)

var kelvin_to_fahrenheit = function(img){
  /** Fahrenheit = Kelvin × 9/5 - 459.67*/
  return img.multiply(9/5)
            .subtract(459.67)
            .copyProperties(img, ['system:time_start','system:time_end']); 
};

var to_multiband = function(collection){  
  /** Convert image collection to multi-band image */
  var cat = function(band, img) {
    return ee.Image(img).addBands(band);
  };
  var multiband = ee.Image(collection.slice(1)
                                     .iterate(cat, collection.get(0)));
  return multiband;
};

var viz_gdd =
  '<RasterSymbolizer>' +
    '<ColorMap  type="intervals" extended="false" >' +
      '<ColorMapEntry color="#008000" quantity="2500" label="under2500"/>' +
      '<ColorMapEntry color="#5def7d" quantity="3000" label="2501–3000"/>' +
      '<ColorMapEntry color="#FFFF00" quantity="3500" label="3001–3500"/>' +
      '<ColorMapEntry color="#F0A804" quantity="4000" label="3501–4000" />' +
      '<ColorMapEntry color="#FF0000" quantity="10000" label="over4000" />' +
    '</ColorMap>' +
  '</RasterSymbolizer>';


var calc_gdd_annual = function(year){
   /** Calculate mean of monthly min and max temperature at the pixel level from daily data.
       Cumulative GDD is a running total of GDD from April 1 through October 31.
       GDD = ((Tmax + Tmin)/2) - Tbase // Tbase 10°C = 283.15K */

  var gridmet = ee.ImageCollection('IDAHO_EPSCOR/GRIDMET')
                  .filterDate(year+'-01-01', (year+1)+'-01-01');
  var tmmn = gridmet.select("tmmn")
                    .map(kelvin_to_fahrenheit);
  var tmmx = gridmet.select("tmmx")
                    .map(kelvin_to_fahrenheit);
  
  // "Normalize" min/max for GDD calculation.
  var tmmx_86 = tmmx.map(function(img){
    return img
      .where(img.gt(86), ee.Image(86))
      .where(img.lt(50), ee.Image(50));
  });
  var tmmn_50 = tmmn.map(function(img){
    return img
      .where(img.lt(50), ee.Image(50))
      .where(img.gt(86), ee.Image(86));
  });
  
  // Join collections for calculation by custom filter.
  var filterTimeEq = ee.Filter.equals({
    leftField:'system:time_start', 
    rightField: 'system:time_start'
  });
  // apply the join and filter, outputs feature collection.
  var joined_minmax = ee.Join.inner().apply(tmmx_86, tmmn_50, filterTimeEq);
  // convert back to an image collection and calculate DD
  var calc_gdd_daily = function(feature) {
    var primary = ee.Image(feature.get('primary'));
    var secondary = ee.Image(feature.get('secondary'));
    var combined = ((primary.add(secondary)).divide(2)).subtract(50)
      .copyProperties(primary, ['system:index', 'system:time_start','system:time_end']);
    return combined
  }
  
  var gdd_daily = ee.ImageCollection(joined_minmax.map(calc_gdd_daily))
    .select(['tmmx'], ['gdd']); //rename bands because join copys tmmx values.

  var annual_gdd = ee.Image(gdd_daily
    .filterDate(year+'-04-01', (year+1)+'-10-01')
    .reduce(ee.Reducer.sum())
  ).set('year', year)
  
  //Visualize annual gdd maps.
  Map.addLayer(annual_gdd.sldStyle(viz_gdd), {}, '' + year);
                
  return annual_gdd
}

var gdd_years = ee.ImageCollection(years.map(calc_gdd_annual))
print(gdd_years)