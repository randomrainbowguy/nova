
function onCreatePost()
    for i, b in pairs({'b','b2'}) do
        makeLuaSprite(b, '', 0, -320)
        makeGraphic(b, screenWidth*2.5, screenHeight*2.5, (i>1) and '1a1a1a' or '000000')
        addLuaSprite(b)
        setObjectCamera(b, (i>1) and 'game' or 'other')
        setProperty(b..'.alpha', (i>1) and 0 or 1)
    end

    triggerEvent('Camera Follow Pos', 1419, 119.5)
    setProperty('camGame.zoom', 1.5)
    setProperty('camHUD.alpha', 0)
end

local steps = {
    [1] = function() doTweenAlpha('f', 'b', 0, 6, 'quadOut') end,

    [24] = function()
        doTweenZoom('z', 'camGame', 0.7, 3.5, 'cubeInOut')
        doTweenY('d', 'camFollow', 559.5, 3.5, 'cubeInOut')
    end,

    [64] = function() doTweenZoom('z', 'camGame', 0.85, 1.5, 'cubeOut') end,
    [112] = function() doTweenZoom('z', 'camGame', 1.3, 1.68, 'circIn') end,

    [128] = function()
        cameraFlash('camOther', 'ffffff', 0.8)
        setProperty('camHUD.alpha', 1)
    end,

    [480] = function()
        setObjectCamera('b', 'game')
        doTweenAlpha('b', 'b', 0.2, 1, 'quadOut')
    end,

    [496] = function() doTweenAlpha('bb', 'b', 0.4, 0.5, 'quadOut') end,
    [504] = function() doTweenAlpha('bbb', 'b', 0.6, 0.5, 'quadOut') end, 
    [512] = function() doTweenAlpha('bbbb', 'b', 1, 2, 'quadOut') end,

    -- mickey laugh....
    [528] = function() 
        cameraFlash('camOv', '000000', 0.5)
        setProperty('cameraSpeed', 100)
        setProperty('boyfriend.alpha', 0)
        setProperty('b2.alpha', 1)
    end,

    [544] = function()
        setProperty('camGame.zoom', 1)
        cameraFlash('camOther', '000000', 0.8)
        setProperty('b.alpha', 0.3)
        setProperty('b2.alpha', 0)
        setProperty('boyfriend.alpha', 1)
    end,

    [1056] = function() 
        setObjectCamera('b2', 'ov')
        doTweenColor('vb', 'b2', '000000', 1.5, 'quadOut')
        doTweenAlpha('f', 'b2', 1, 1.5, 'quadOut')

        doTweenZoom('z', 'camGame', 1.5, 2, 'quadInOut')
        doTweenAlpha('h', 'camHUD', 0, 2.5, 'quadOut')
    end,

    [1104] = function() 
        makeLuaSprite('head', 'headshot')
        scaleObject('head', 2.5, 2.5)
        setObjectCamera('head', 'other')
        addLuaSprite('head')
        screenCenter('head')
        setProperty('head.alpha', 0)

        doTweenAlpha('h', 'head', 0.9, 9, 'quadInOut')
        for i, d in pairs({'x','y'}) do _G['doTween'..d:upper()]('m'..d, 'head.scale', 2, 9, 'quadInOut') end
    end,

    [1200] = function() removeLuaSprite('head', true) end
}

function onStepHit() if steps[curStep] then steps[curStep]() end end