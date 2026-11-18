
function onCreate()
    makeLuaSprite('b', '', 0, -320)
    makeGraphic('b', screenWidth*2.5, screenHeight*2, '000000')
    addLuaSprite('b')
    setObjectCamera('b', 'other')
    setProperty('b.alpha', 0)
end

local steps = {
    [1020] = function() doTweenZoom('d', 'camGame', 1.2, 0.4, 'cubeIn') end,
    [1024] = function() setProperty('b.alpha', 1) end,

    [1040] = function()
        setProperty('camGame.zoom', 1)
        cameraFlash('camOther', 'ffffff', 0.8)
        setObjectCamera('b', 'game')
        setProperty('b.alpha', 0.3)
    end,

    [1296] = function() 
        doTweenX('s', 'camFollow', 1189, 3.5, 'cubeInOut')
        doTweenY('s2', 'camFollow', 583.7, 3.5, 'cubeInOut')
        doTweenAlpha('a', 'camHUD', 0, 3, 'cubeOut')
        doTweenAlpha('n', 'b', 0.45, 7)
    end,

    [1328] = function() 
        cameraFlash('camOther', 'ffffff', 0.7) 
        doTweenAlpha('a', 'camHUD', 1, 0.3, 'cubeOut')
    end,

    [1584] = function() doTweenAlpha('bb', 'b', 0.6, 1, 'quadOut') end,

    [1840] = function() 
        setObjectCamera('b', 'other')
        setProperty('b.alpha', 1)
    end
}

function onStepHit() if steps[curStep] then steps[curStep]() end end

function onSongStart() setProperty('songLength', 96700) end

function onUpdatePost()
	if getProperty('songLength') < songLength and curStep >= 1041 then 
		if (getProperty('songLength') + 1000) < songLength then
			setProperty('songLength', getProperty('songLength')+1000) 
		else
			setProperty('songLength', songLength)
		end
	end
end