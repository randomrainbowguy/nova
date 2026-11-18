function adService(){
	this.loadRewardState = -1;
	this.n = -1;
    this.a = 1;
    this.o = 2;
    this.l = 3;

}

adService.prototype.startPreLoad = function() {
    setInterval(this.checkHasAd.bind(this), 30000);
    this.checkHasAd();
}, 

adService.prototype.checkHasAd = function() {
	var t = this;
    if(this.loadRewardState !== this.o && this.loadRewardState !== this.a) 
        this.loadRewardedVideo()
 }, 

adService.prototype.loadRewardedVideo = function(e) {
    var t = this;

    if(this.loadRewardState !== this.o && this.loadRewardState !== this.a){
        if (typeof gdsdk !== 'undefined' && gdsdk.preloadAd !== 'undefined'){
            t.loadRewardState = this.a
            gdsdk.preloadAd('rewarded').then(response => {
                t.loadRewardState = t.o;
            }).catch(error => {
                t.loadRewardState = t.n;
            });
        }
    } 
               
}, 

adService.prototype.showRewardedVideo = function(e, t) {
    var i = this;

   
        return new Promise(function(ts, rs){ 
            if(i.loadRewardState == i.o){
        	    if(typeof gdsdk !== 'undefined' && gdsdk.showAd !== 'undefined'){
        	        gdsdk.showAd('rewarded').then(function() {
        	            ts();
        	            i.loadRewardState = i.n;
        	        }).catch(function(e) {
        	            rs();
                        i.loadRewardState = i.n;
        	        });
        	   } else rs();
            }else rs();
    	});

}