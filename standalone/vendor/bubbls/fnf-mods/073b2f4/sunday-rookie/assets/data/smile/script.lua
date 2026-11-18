
local drain = false

function onCreate()
    makeLuaSprite('b', '', 0, -320)
    makeGraphic('b', screenWidth*2.5, screenHeight*2, '000000')
    addLuaSprite('b')
    setObjectCamera('b', 'other')

    setProperty('camHUD.alpha', 0)
    setProperty('skipCountdown', true)

    for i, h in pairs({'healthBar','iconP1','iconP2'}) do
        setProperty(h..'.y', getProperty(h..'.y') + (downscroll and -10 or 10))
    end
end

local steps = {
    [1] = function()
        setProperty('camGame.zoom', 1.5)
        doTweenZoom('z', 'camGame', 0.9, 17, 'quadInOut')
        doTweenAlpha('bb', 'b', 0, 20, 'quadInOut')
        setProperty('scoreTxt.visible', false)
    end,

    [128] = function()
        addHaxeLibrary('FlxTween', 'flixel.tweens')
        setProperty('camHUD.alpha', 1)
        cameraFlash('camOther', '000000', 0.8)
        cancelTween('bb')
        setProperty('b.alpha', 0)
    end,

    [384] = function() drain = true end,
    [704] = function() drain = false end,

    [768] = function() 
        doTweenX('s', 'camFollow', 1677.5, 1.5, 'cubeOut')
        doTweenY('s2', 'camFollow', 637.5, 1.5, 'cubeOut')
        doTweenZoom('z', 'camGame', 2, 3.5, 'cubeInOut')
        setProperty('defaultCamZoom', 1.2)

        setObjectCamera('b', 'ov')
        doTweenAlpha('bb', 'b', 1, 2.6, 'quadOut')
        doTweenAlpha('h', 'camHUD', 0, 2.5, 'quadOut')
    end
}

function onBeatHit()
    if drain and curBeat % 2 == 0 then
        runHaxeCode('FlxTween.tween(game, {health: '..(getHealth() - 0.04)..'}, 0.6, {ease: FlxEase.quadOut})')
    end
end

function onUpdate()
    for i = 0,getProperty('notes.length')-1 do setPropertyFromGroup('notes', i, 'hitHealth', drain and 0 or 0.008) end
end

function onStepHit() if steps[curStep] then steps[curStep]() end end