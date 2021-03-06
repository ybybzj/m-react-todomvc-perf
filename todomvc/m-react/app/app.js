var router = require('page');
var Page = require('./page.msx');
var SF = require('s-flow');
var m = require('m-react');
var app = SF({
  state: require('./state'),
  signal: require('./signal'),
  watch: require('./update')
});

app.init();
m.mount(document.getElementById('todoapp'), <Page sf={app}/>);
router('/:filter?', function(cxt){
  var filter = cxt.params.filter;
  filter = filter == null ? 'all': filter.trim() == '' ? 'all': filter.trim();
  app.signal.getEmitter('filterChanged')(filter);
});
router();