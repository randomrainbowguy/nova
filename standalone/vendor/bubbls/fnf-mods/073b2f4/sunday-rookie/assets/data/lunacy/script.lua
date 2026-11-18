
local gfSing = false
local missThing = false
local m = 0

function onCreatePost() 
    for i, b in pairs({'b1','b2','b3'}) do
        makeLuaSprite(b, '', 0, (i==2) and 0 or -330)
        makeGraphic(b, screenWidth*2.5, screenHeight*2.5, '000000')
        setObjectCamera(b, (i==2) and 'ov' or 'game')
        addLuaSprite(b)
    end

    makeAnimatedLuaSprite('fire', 'fireBG', -80, 0)
    addAnimationByPrefix('fire', 'i', 'idle', 24, true)
    scaleObject('fire', 2.8, 2.8)
    setObjectCamera('fire', 'other')
    addLuaSprite('fire')
    setProperty('fire.alpha', 0.4)
    setProperty('fire.visible', false)

    makeLuaSprite('ov', 'blackvignette')
    setObjectCamera('ov', 'other')
    addLuaSprite('ov')

    playSound('scream', 0, 'sc')
    triggerEvent('Camera Follow Pos', 1039, 591)

    initLuaShader('color')
    setSpriteShader('dad', 'color')
    setColor('dad', 0.3, 0.3, 0.3)

    for i, n in pairs({'camHUD','boyfriend','b3'}) do setProperty(n..'.alpha', 0) end
end

function onCreate() 
    addCharacterToList('Rhappy-mouse', 'dad')
    setProperty('skipCountdown', true) 
end

local steps = {
    [1] = function() 
        setProperty('camGame.zoom', 0.3)
        doTweenZoom('z', 'camGame', 0.9, 22.55, 'cubeIn')
        doTweenAlpha('d', 'b2', 0, 15, 'quadIn')
    end,

    [256] = function()
        for i, n in pairs({'camHUD','boyfriend','b1'}) do setProperty(n..'.alpha', (i>2) and 0 or 1) end
        setProperty('camGame.zoom', 2)
        cameraFlash('camOther', 'ffffff', 0.8)
    end,

    [512] = function() cameraFlash('camHUD', 'ffffff', 0.8) end,

    [1024] = function()
        doTweenAlpha('d', 'b2', 1, 1.5, 'quadOut')
        doTweenZoom('z', 'camGame', 2, 2, 'cubeInOut')
    end,
 
    -- dark.. and light..
    [1056] = function() 
        cameraFlash('camGame', '000000', 0.3)
        setProperty('camGame.zoom', 0.01)
        doTweenZoom('z', 'camGame', 0.8, 3, 'cubeOut')
        setProperty('b1.alpha', 1)
        setObjectOrder('b1', getObjectOrder('gfGroup'))
        setProperty('b2.alpha', 0)

        for i, c in pairs({'dad','boyfriend','gf'}) do 
            local v = (i>2) and 0.3 or 1
            setSpriteShader(c, 'color')
            setColor(c, v, v, v)
        end
    end,

    -- mickey evil...
    [1184] = function()
        gfSing = true
        m = misses
        setProperty('gfGroup.visible', true)
        runHaxeCode('game.gf.setPosition(710, 310);')
        doTweenAlpha('g', 'b1', 0.4, 1.5, 'quadOut')
        setProperty('b3.alpha', 1)
    end,

    [1248] = function() doTweenAlpha('g', 'b1', 1, 1.5, 'quadOut') end,

    [1264] = function()
        gfSing = false
        setProperty('gfGroup.visible', false)
        removeSpriteShader('gf')
        removeLuaSprite('b3', true)
    end,

    [1312] = function() doTweenZoom('z', 'camGame', 20, 3, 'cubeOut') end,

    [1325] = function() 
        cameraFlash('camGame', 'ffffff', 0.8)
        for i, c in pairs({'dad','boyfriend'}) do 
            removeSpriteShader(c) 
            setProperty(c..'.alpha', 0)
        end
        cancelTween('z')
    end,

    -- wtf everythings messed up....
    [1348] = function()
        missThing = true
        m = misses
        cameraFlash('camHUD', 'ffffff', 0.6)
        for i, c in pairs({'dad','boyfriend','b1'}) do setProperty(c..'.alpha', (i>2) and 0 or 1) end
        setProperty('camGame.zoom', 2)
        setTextString('scoreTxt', 'Misses: 0 / 5') -- fuck

        setProperty('fire.visible', true)
        doTweenY('f', 'fire', -290, 0.7, 'circOut')
    end,

    [2112] = function()
        cameraFlash('camOther', 'ffffff', 0.8)
        setSpriteShader('dad', 'color')
        setColor('dad', 0.3, 0.3, 0.3)
        for i, c in pairs({'boyfriend','b1'}) do setProperty(c..'.alpha', (i>1) and 1 or 0) end
        doTweenZoom('z', 'camGame', 0.05, 5, 'cubeInOut')
        doTweenAlpha('d', 'b2', 1, 4.2, 'quadOut')
        doTweenAlpha('ca', 'camHUD', 0, 1.9, 'quadOut')
        removeLuaSprite('fire', true)
    end
}

function onUpdate() 
    setSoundVolume('sc', (1 - getHealth())/2) 
    setProperty('ov.alpha', getSoundVolume('sc')*3)

    if curStep < 254 then setProperty('camZooming', false) end

    if missThing then 
        for i, n in pairs({'healthBar','healthBarBG','iconP1','iconP2'}) do setProperty(n..'.visible', false) end
    end
end

function onUpdateScore()
    if missThing then
        local mm = math.abs(m - misses)
        setTextString('scoreTxt', 'Misses: '..mm..' / 5')
        if mm == 5 then setProperty('health', 0) end
    end
end

function onPause() pauseSound('sc') end
function onResume() resumeSound('sc') end
function onGameOver() stopSound('sc') end

function onSoundFinished(t) if t == 'sc' then playSound('scream', 0, 'sc') end end

function opponentNoteHit(id, nd)
    if gfSing then
        playAnim('gf', getProperty('singAnimations')[nd+1], true)
        setProperty('gf.holdTimer', 0)
    end
end

function setColor(obj, a, b, c)
    --for i, v in pairs({'a','b','c'}) do setShaderFloat(obj, v, _G[v]) end
    setShaderFloat(obj, 'a', a)
    setShaderFloat(obj, 'b', b)
    setShaderFloat(obj, 'c', c)
end

function onStepHit() if steps[curStep] then steps[curStep]() end end