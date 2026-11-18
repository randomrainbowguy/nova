function onCreate()
    setProperty('skipCountdown', true)
    addCharacterToList('livesey/DR-png', 'dad')
    addCharacterToList('livesey/livesey-finale', 'dad')
    addCharacterToList('PLAYABLE/bf-pirate-sit', 'boyfriend')
    addCharacterToList('PLAYABLE/bf-png', 'boyfriend')

    makeAnimatedLuaSprite('markanim', 'special_Anims/mark animation',1275,440)
    addAnimationByPrefix('markanim','dialogue', 'mark showing', 24,false);
    scaleObject('markanim',0.9,0.9)
    addLuaSprite('markanim')

    makeLuaSprite('flashbla', '', -2, -2);
    makeGraphic('flashbla',screenWidth+4,screenHeight+4,'ffffff')
    addLuaSprite('flashbla', true);
    setBlendMode('flashbla', 'SUBTRACT')
    setObjectCamera('flashbla', 'other')

    for i = 1,2 do
    makeAnimatedLuaSprite('FuckMP4_'..i, 'FuckMP4 '..i)
    addAnimationByPrefix('FuckMP4_'..i,'Play', 'Play', 10,false);
    scaleObject('FuckMP4_'..i,1.15,1.15)
    screenCenter('FuckMP4_'..i, 'xy')
    setObjectCamera('FuckMP4_'..i,'other')
    addLuaSprite('FuckMP4_'..i,true)
    end
end

function onCreatePost()
    setProperty('camGame.alpha', 0)
    setProperty('camHUD.alpha', 0)
    setProperty('boyfriend.alpha',0)
    setProperty('gf.alpha',0)
    setProperty('boat.visible',false)
    setProperty('barrel.visible',false)
    setProperty('candle.visible',false)
    setProperty('markanim.visible',false)
    setProperty('FuckMP4_2.visible',false)
    setProperty('flashbla.alpha',0)
end

function onSongStart()
    playAnim('FuckMP4_1','Play',true)
end


local hideHud = {'iconP1', 'iconP2', 'scoreTxt', 'healthBar', 'healthBarBG', 'timeBar', 'timeBarBG', 'timeTxt', 'boat', 'barrel', 'candle'}
function onEvent(n,v1,v2)
    if n == 'camera_target' then
        if v1 == 'all' then
            folowcam = true
        else
            folowcam = false
        end
    end

    if n == 'hud' then
        for i = 1,#hideHud do
            if v1 == '1' then
            setProperty(hideHud[i]..'.visible', false)
            else
            setProperty(hideHud[i]..'.visible', true)
            end
        end
    end

    if n == 'GBG' then
        if v1 == 'on' then
            triggerEvent('hud','1')
            else
            triggerEvent('hud',0)

        end
    end
end


folowcam = false
camX = 1560
camY = 1150
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end

function onStepHit()
    if curStep == 10 then
        playAnim('FuckMP4_1','Play',true)

    elseif curStep == 14 then
        playAnim('FuckMP4_1','Play',true)
        setProperty('FuckMP4_1.visible',true)

    elseif curStep == 94 then
        playAnim('FuckMP4_2','Play',true)
        setProperty('FuckMP4_2.visible',true)
        removeLuaSprite('FuckMP4_1',true)

    elseif curStep >= 168 and curStep <= 175 then
        playAnim('FuckMP4_2','Play',true,false,getRandomInt(58,60))

    elseif curStep == 176 then
        doTweenAlpha('osne','FuckMP4_2',0,3.5)
        playAnim('FuckMP4_2','Play',true,false,55)

    elseif curStep == 191 then
        playAnim('FuckMP4_2','Play',true,false,55)

    elseif curStep == 240 then
        removeLuaSprite('FuckMP4_2',true)

    elseif curStep == 352 then
        setProperty('camHUD.alpha', 1)
        setProperty('boyfriend.alpha',1)
        setProperty('gf.alpha',1)

    elseif curStep == 480 then
        beat = 1

    elseif curStep == 608 then
        beat = 0
        for i = 1,#hideHud do
            doTweenAlpha(hideHud[i],hideHud[i],0,1.41)
        end
        doTweenAlpha('cam2','camHUD',0,1.41)
        doTweenAlpha('bf','boyfriend',0,1.41)
        doTweenAlpha('gf','gf',0,1.41)
        playAnim('markanim','dialogue',true)
        setProperty('dad.visible',false)
        setProperty('markanim.visible',true)

    elseif curStep == 664 then
        doTweenAlpha('cam1','camGame',0,0.3)
        doTweenAlpha('cam2','camHUD',0,0.3)

    elseif curStep == 672 then
        setProperty('boyfriend.alpha',1)
        setProperty('dad.visible',true)
        removeLuaSprite('markanim',true)
        triggerEvent('hud','1')

        setProperty('photo.visible',true)
        setProperty('ramka.visible',true)

        for i = 1,#hideHud do
            setProperty(hideHud[i]..'.alpha',1)
        end

        setProperty('camGame.alpha',1)
        setProperty('camHUD.alpha',1)

        folowcam = false
        camX = 1400
        camY = 800

    elseif curStep == 1005 then
        beat = 0
    elseif curStep == 1022 then
        doTweenAlpha('flTdw','flashbla',1,0.42)
    elseif curStep == 1037 then
        removeLuaSprite('photo',true)
        removeLuaSprite('ramka',true)
        camX = 1560
        camY = 1150
    elseif curStep == 1040 then
        doTweenAlpha('flTdw','flashbla',0,1)
        setProperty('gf.alpha',1)
        triggerEvent('hud',0)
        setProperty('boat.visible',true)
        setProperty('candle.visible',true)
        setProperty('barrel.visible',true)

    end
end


beat = 0
function onBeatHit()
    if curBeat %4 == 2 and beat == 1 then
        triggerEvent('AddChrom',1.5)
    end
end
