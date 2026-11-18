function onCreate()
    setProperty('camGame.alpha', 0)
    setProperty('camHUD.alpha', 0)

    makeAnimatedLuaSprite('jakeanim1', 'special_Anims/jake-scream1', 400,150)
    addAnimationByPrefix('jakeanim1', 'dialogue', 'Jake Scream1', 24, false)
    scaleObject('jakeanim1', 0.8,0.8)
    setProperty('jakeanim1.offset.x', 30)
    setProperty('jakeanim1.offset.y', -100)
    addLuaSprite('jakeanim1', true)

    makeAnimatedLuaSprite('jakeanim2', 'special_Anims/jake-scream2', 400,150)
    addAnimationByPrefix('jakeanim2', 'dialogue', 'Jake Scream2', 24, false)

    addAnimationByIndices('jakeanim2', 'dialogue2', 'Jake Scream2', [[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50]], 24, true)

    scaleObject('jakeanim2', 0.8,0.8)
    addLuaSprite('jakeanim2', true)
end

function onCreatePost()
    setProperty('jakeanim1.visible', false)
    setProperty('jakeanim2.visible', false)
end


function onEvent(n,v1,v2)
    if n == 'camera_target' then
        if v1 == 'all' then
            folowcam = true
        else
            folowcam = false
        end
    end

    if n == 'GBG' then
        if v1 == 'on' then
            setProperty('laboratory.visible', false)
        else
            setProperty('laboratory.visible', true)
        end
    end

    if n == 'Set Property' then
        if v2 == '1' and curStep <= 238 then
            doTweenAlpha('1', 'camGame', 0,0.7)
        end
    end
end

folowcam = true
camX = 1300
camY = 650
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end


function onStepHit()
    if curStep == 1 then
        setProperty("dad.colorTransform.color", 0xffffff)
        setProperty("boyfriend.colorTransform.color", 0xffffff)
        setProperty("gf.colorTransform.color", 0xffffff)
        setProperty('GBG.visible', false)
        setProperty('laboratory.visible', false)

    elseif curStep == 240 then
        setProperty('laboratory.visible', false)
        camY = 600
        setProperty('gf.visible', false)
    elseif curStep == 256 then
        setProperty('camHUD.alpha', 1)
        setProperty('gf.visible', true)
        setProperty('laboratory.visible', true)

    elseif curStep == 496 then
        setProperty('camHUD.alpha', 0)
        setObjectCamera('UpperBar', 'other')
        setObjectCamera('LowerBar', 'other')

    elseif curStep == 512 then
        setProperty('camHUD.alpha', 1)
        setObjectCamera('UpperBar', 'hud')
        setObjectCamera('LowerBar', 'hud')

    elseif curStep == 1291 or curStep == 2379 then
        doTweenAlpha('1', 'camGame', 0, 1, 'expoOut')

    elseif curStep == 1296 or curStep == 2384 then
        doTweenAlpha('1', 'camGame', 1, 1, 'expoOut')

    elseif curStep == 1412 then
        setProperty('gf.visible', false)
        setProperty('boyfriend.visible', false)
        runTimer('invert',0.1,0)
        setProperty('dad.colorTransform.greenOffset', 0)
        setProperty('dad.colorTransform.redOffset', 0)
        setProperty('dad.colorTransform.blueOffset', 0)

        setProperty('dad.colorTransform.redMultiplier', 1)
        setProperty('dad.colorTransform.blueMultiplier', 1)
        setProperty('dad.colorTransform.greenMultiplier', 1)

    elseif curStep == 1416 then
        doTweenAlpha('1', 'camGame', 1, 1, 'expoOut')

    elseif curStep == 1424 then
        doTweenAlpha('1', 'camHUD', 0, 1, 'expoOut')
        playAnim('jakeanim1', 'dialogue', true)
        setProperty('jakeanim1.visible', true)
        setProperty('dad.visible', false)

    elseif curStep == 1429 then
        playAnim('jakeanim2', 'dialogue', true)
        setProperty('jakeanim2.visible', true)
        removeLuaSprite('jakeanim1', true)

    elseif curStep == 1443 then
        playAnim('jakeanim2', 'dialogue2', true)

    elseif curStep == 1472 then
        cancelTimer('invert')
        removeLuaSprite('jakeanim2', true)
        setProperty('camHUD.alpha', 1)
        setProperty('dad.visible', true)
        setProperty('gf.visible', true)
        setProperty('boyfriend.visible', true)

    elseif curStep == 2496 then
        noteTweenAlpha('1', 0,0,0.01)
        noteTweenAlpha('2', 2,0,0.01)
        noteTweenAlpha('3', 3,0,0.01)
        for i = 4,7 do
            noteTweenAlpha(i, i,0,0.5,'sineInOut')
        end

        noteTweenX('move', 1,600,3.5)
        noteTweenY('move2', 1,300,3.5)
        doTweenZoom('move3', 'camHUD',2,3.5)
    elseif curStep == 2539 then
        doTweenAlpha('odh', 'camHUD', 0, 0.3,'expoOut')
    end
end


invert = false
function onTimerCompleted(t)
    if t == 'invert' then
        if invert then
            setProperty('jakeanim2.colorTransform.redOffset', 0)
            setProperty('jakeanim2.colorTransform.blueOffset', 0)
            setProperty('jakeanim2.colorTransform.greenOffset', 0)

            setProperty('jakeanim2.colorTransform.redMultiplier', 1)
            setProperty('jakeanim2.colorTransform.blueMultiplier', 1)
            setProperty('jakeanim2.colorTransform.greenMultiplier', 1)
            invert = false
        else
            setProperty('jakeanim2.colorTransform.redOffset', 255)
            setProperty('jakeanim2.colorTransform.blueOffset', 255)
            setProperty('jakeanim2.colorTransform.greenOffset', 255)

            setProperty('jakeanim2.colorTransform.redMultiplier', -1)
            setProperty('jakeanim2.colorTransform.blueMultiplier', -1)
            setProperty('jakeanim2.colorTransform.greenMultiplier', -1)
            invert = true
        end
    end
end