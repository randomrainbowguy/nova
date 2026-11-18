local chrColor = {'red', 'green', 'blue'}
function onCreate()
    setProperty('camGame.alpha', 0)
    setProperty('camHUD.alpha', 0)
    setProperty('boyfriend.alpha', 0)
    setProperty('gf.alpha', 0)


    makeAnimatedLuaSprite('gumfake', 'characters/AT/bubblegum', 500,250)
    setObjectCamera('gumfake', 'other')
    addAnimationByPrefix('gumfake','idle', 'Idle', 24,true);
    scaleObject('gumfake', 0.9, 0.9)
    setProperty('gumfake.offset.x', 230)
    setProperty('gumfake.offset.y', 100)
    addLuaSprite('gumfake')


    setProperty("dad.colorTransform.color", 0xffffff)
    setProperty("gumfake.colorTransform.color", 0xffffff)
end


function onCreatePost()
    setProperty('gumfake.alpha', 0)
    setProperty('laboratory.visible',false)
end


function onSongStart()
    setProperty('camGame.alpha', 1)
end


local hideHud = {'iconP1', 'iconP2', 'scoreTxt', 'healthBar', 'healthBarBG', 'timeBar', 'timeBarBG', 'timeTxt'}
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
            setProperty('laboratory.visible',false)
            else
            setProperty('laboratory.visible',true)
        end
    end
end


folowcam = false
camX = 1300
camY = 600
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end

local chr = {'dad', 'boyfriend', 'gf', 'laboratory'}
function onStepHit()
    if curStep == 64 then
        doTweenAlpha('1', 'gumfake', 1, 1)
        doTweenAlpha('2', 'dad', 0, 1)
        setProperty('gumfake.velocity.y', -25)
    elseif curStep == 120 then
        doTweenAlpha('1', 'gumfake', 0, 0.7)
    elseif curStep == 128 then
        setProperty('gumfake.velocity.y', 0)
        removeLuaSprite('gumfake', true)
        setProperty('camGame.alpha', 1)
        setProperty('camHUD.alpha', 1)
        setProperty('boyfriend.alpha', 1)
        setProperty('dad.alpha', 1)
        setProperty('gf.alpha', 1)

    elseif curStep == 896 then
        for i = 1,#chr do
            setProperty(chr[i]..'.colorTransform.redOffset', -136)
            setProperty(chr[i]..'.colorTransform.greenOffset', -205)
            setProperty(chr[i]..'.colorTransform.blueOffset', -108)
        end

        triggerEvent('cooltrail', '1')
        triggerEvent('hud','1')

    elseif curStep == 1024 then
        for i = 1,#chr do
            setProperty(chr[i]..'.colorTransform.redOffset', -106)
            setProperty(chr[i]..'.colorTransform.greenOffset', -155)
            setProperty(chr[i]..'.colorTransform.blueOffset', -58)
        end

    elseif curStep == 1138 then

        for i = 1,#chr do
            setProperty(chr[i]..'.colorTransform.redOffset', 0)
            setProperty(chr[i]..'.colorTransform.greenOffset', 0)
            setProperty(chr[i]..'.colorTransform.blueOffset', 0)
        end

        triggerEvent('cooltrail', '1')

    elseif curStep == 1152 then
        triggerEvent('hud',0)
    elseif curStep == 1540 then
        doTweenAlpha('1', 'camHUD', 0, 1)
    end
end