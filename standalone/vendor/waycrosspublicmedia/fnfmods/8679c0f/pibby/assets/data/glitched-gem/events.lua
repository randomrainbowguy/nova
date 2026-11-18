function onCreate()
    addCharacterToList('SU/POV_Steven', 'dad')
    addCharacterToList('SU/pink-steven', 'dad')
    addCharacterToList('SU/Weak_steven', 'dad')
    initLuaShader('inverter')

    setProperty('camGame.alpha', 0)
    setProperty('camHUD.alpha', 0)
    setProperty("skipArrowStartTween", true)

    makeAnimatedLuaSprite('POVanim', 'special_Anims/POVsteven_Voiceline')
    addAnimationByPrefix('POVanim', 'dialogue', 'Steven Voiceline', 24, false)
    addLuaSprite('POVanim', true)

    makeAnimatedLuaSprite('pinkanim', 'special_Anims/Stop_it')
    addAnimationByPrefix('pinkanim', 'dialogue', 'Stop It', 24, false)
    setProperty('pinkanim.offset.x',-101)
    setProperty('pinkanim.offset.y',167)
    addLuaSprite('pinkanim', true)

    makeAnimatedLuaSprite('Voiceline', 'special_Anims/Steven_Voiceline')
    scaleObject('Voiceline',1.5,1.5)
    addAnimationByPrefix('Voiceline', 'dialogue', 'HoldingBack', 24, false)
    addLuaSprite('Voiceline', true)
end


local hideall = {'ground', 'sky', 'lion', 'goofyAhhDarkness', 'stevensword', 'clusterhand', 'moon', 'water', 'clouds', 'gf', 'iconP1', 'iconP2', 'healthBar', 'healthBarBG', 'scoreTxt', 'timeBar', 'timeBarBG', 'timeTxt'}
local chrColor = {'red', 'green', 'blue'}
function onCreatePost()
    makeLuaSprite("vig",'vig')
    setObjectCamera('vig', 'other')
    addLuaSprite("vig")

    for i = 1,#chrColor do
        setProperty('dad.colorTransform.'..chrColor[i]..'Offset', -105)
        setProperty('boyfriend.colorTransform.'..chrColor[i]..'Offset', -105)
    end

    setProperty('boyfriend.alpha', 0)
    setProperty('boyfriend.x', getProperty('dad.x') + 130)
    setProperty('boyfriend.y', getProperty('dad.y') - 100)

    triggerEvent('hud','1')

    setProperty('Voiceline.x', getProperty('dad.x') + 100)
    setProperty('Voiceline.y', getProperty('dad.y') - 280)

    setProperty('POVanim.visible',false)
    setProperty('pinkanim.visible',false)
    setProperty('Voiceline.visible',false)
end


function onSongStart()
    doTweenAlpha('1', 'camGame',1,1.5,'sineInOut')
    for i = 0,3 do
        noteTweenAlpha("yes"..i, i, 0, 0.01)
    end
end


function onEvent(n,v1,v2)
    if n == 'camera_target' then
        if v1 == 'all' then
            folowcam = true
            camX = 500
            camY = 500
        else
            folowcam = false
        end
    end


    if n == 'hud' then
        for i = 1,#hideall do
            if v1 == '1' then
            setProperty(hideall[i]..'.visible', false)
            else
            setProperty(hideall[i]..'.visible', true)
            end
        end
    end
end

folowcam = true
camX = -180
camY = 400
function onUpdate()
    if folowcam then
        setProperty('camFollow.x', camX)
        setProperty('camFollow.y', camY)
    end
end

function onStepHit()
    if curStep == 48 then
        doTweenAlpha('1', 'camHUD', 1, 1, 'sineInOut')

    elseif curStep == 55 then
        noteTweenX('2',4,412,1,'sineInOut')
        noteTweenX('3',5,524,1,'sineInOut')
        noteTweenX('4',6,636,1,'sineInOut')
        noteTweenX('5',7,748,1,'sineInOut')

    elseif curStep == 64 or curStep == 192 then
        doTweenAlpha('1', 'boyfriend', 1, 1, 'sineInOut')
        doTweenAlpha('2', 'dad', 0, 1, 'sineInOut')
    elseif curStep == 128 then
        doTweenAlpha('1', 'boyfriend', 0, 1, 'sineInOut')
        doTweenAlpha('2', 'dad', 1, 1, 'sineInOut')
    elseif curStep == 256 then
        doTweenAlpha('1', 'camGame',0,1.5,'sineInOut')
        doTweenAlpha('2', 'camHUD',0,1.5,'sineInOut')
    elseif curStep == 270 then
        doTweenAlpha('1', 'dad',1,0.01)
        doTweenAlpha('2', 'boyfriend',0,0.01)
        setProperty('boyfriend.x', defaultBoyfriendX + 100)
        setProperty('boyfriend.y', defaultBoyfriendY + 350)

        for i = 1,#chrColor do
            setProperty('dad.colorTransform.'..chrColor[i]..'Offset', 0)
            setProperty('boyfriend.colorTransform.'..chrColor[i]..'Offset', 0)
        end

        setProperty('vig.visible', false)

    elseif curStep == 280 then
        doTweenAlpha('1', 'camGame',1,0.5,'sineInOut')
        setProperty('dad.visible',false)
        playAnim('Voiceline','dialogue',true)
        setProperty('Voiceline.visible',true)

    elseif curStep == 352 then
        triggerEvent('hud',0)

        setProperty('dad.visible',true)
        removeLuaSprite('Voiceline',true)
        doTweenAlpha('1', 'dad',1,0.01)
        doTweenAlpha('2', 'boyfriend',1,0.01)
        doTweenAlpha('3', 'camHUD',1,0.01)
        beat = 1

    elseif curStep == 362 then

        noteTweenX('2',4,defaultPlayerStrumX0,1,'backOut')
        noteTweenX('3',5,defaultPlayerStrumX1,1,'backOut')
        noteTweenX('4',6,defaultPlayerStrumX2,1,'backOut')
        noteTweenX('5',7,defaultPlayerStrumX3,1,'backOut')

        for i = 0,3 do
            noteTweenAlpha('e'..i,i,1,1,'sineInOut')
        end

    elseif curStep == 604 then
        camX = 1300
        camY = 500
        doTweenAlpha('a1', 'camGame', 0,1,'expoOut')
        doTweenAlpha('a2', 'camHUD', 0,1,'expoOut')

    elseif curStep == 608 then
        doTweenAlpha('a1', 'camGame', 1,1.5,'expoOut')
        doTweenAlpha('a2', 'camHUD', 1,1.5,'expoOut')
        camX = -130
        camY = 370

        setProperty('boyfriend.visible', false)
        triggerEvent('hud','1')

        setSpriteShader('dad', 'inverter')
        setShaderInt('dad', 'invert', 0)

        beat = 0

        for i = 0,3 do
            noteTweenAlpha('e'..i,i,0,0.01,'sineInOut')
        end

        for i = 4,7 do
            noteTweenAlpha('i'..i,i,0.7,0.01,'sineInOut')
        end

        noteTweenX('2',4,412,1,'sineInOut')
        noteTweenX('3',5,524,1,'sineInOut')
        noteTweenX('4',6,636,1,'sineInOut')
        noteTweenX('5',7,748,1,'sineInOut')


    elseif curStep == 800 then
        beat = 2
    elseif curStep == 848 then
        beat = 0

    elseif curStep == 863 or curStep == 1088 then
        setProperty('camGame.alpha', 0)
    elseif curStep == 868 then
        doTweenAlpha('a1', 'camGame', 1,1.5,'sineInOut')

    elseif curStep == 888 or curStep == 920 or curStep == 952 or curStep == 984 or curStep == 1016 or curStep == 1048 or curStep == 1080 then
        doTweenAlpha('1', 'vig', 0,0.7)

    elseif curStep == 896 or curStep == 928 or curStep == 960 or curStep == 992 or curStep == 1024 or curStep == 1056 then
        doTweenAlpha('1', 'vig', 1,0.01)

    elseif curStep == 1092 then
        doTweenAlpha('1f', 'camGame', 1, 0.5, 'sineInOut')
        setProperty('POVanim.x', getProperty('dad.x') - 310)
        setProperty('POVanim.y', getProperty('dad.y') - 110)
        setProperty('dad.visible', false)
        playAnim('POVanim','dialogue', true)
        setProperty('POVanim.visible', true)
        setSpriteShader('POVanim', 'inverter')
        setShaderInt('POVanim', 'invert', 0)

    elseif curStep == 1112 then
        setShaderInt('POVanim', 'invert', 1)

    elseif curStep == 1120 then
        removeSpriteShader('POVanim')
        removeLuaSprite('POVanim', true)
        setProperty('boyfriend.visible', true)
        triggerEvent('hud',0)

        for i = 1,9 do
            setSpriteShader(hideall[i], 'inverter')
            setShaderInt(hideall[i], 'invert', 0)
        end

        setProperty('boyfriend.x', defaultBoyfriendX + 100)
        setProperty('boyfriend.y', defaultBoyfriendY + 350)
    for i = 1,#chrColor do
        setProperty('dad.colorTransform.'..chrColor[i]..'Offset', -0)
        setProperty('boyfriend.colorTransform.'..chrColor[i]..'Offset', 0)
    end

        beat = 1
        setProperty('dad.visible', true)
        setSpriteShader('dad', 'inverter')
        setShaderInt('dad', 'invert', 0)

    elseif curStep == 1128 then
        noteTweenX('2',4,defaultPlayerStrumX0,1,'backOut')
        noteTweenX('3',5,defaultPlayerStrumX1,1,'backOut')
        noteTweenX('4',6,defaultPlayerStrumX2,1,'backOut')
        noteTweenX('5',7,defaultPlayerStrumX3,1,'backOut')

        noteTweenX('6',0,defaultOpponentStrumX0,1,'backOut')
        noteTweenX('7',1,defaultOpponentStrumX1,1,'backOut')
        noteTweenX('8',2,defaultOpponentStrumX2,1,'backOut')
        noteTweenX('9',3,defaultOpponentStrumX3,1,'backOut')

        setProperty('pinkanim.x', getProperty('dad.x'))
        setProperty('pinkanim.y', getProperty('dad.y'))

        for i = 0,7 do
            noteTweenAlpha('e'..i,i,1,1,'sineInOut')
        end

    elseif curStep == 1488 then
        for i = 0,3 do
            noteTweenAlpha('e'..i,i,0,0.5,'sineInOut')
        end
        setSpriteShader('pinkanim', 'inverter')
        setShaderInt('pinkanim', 'invert', 0)
        playAnim('pinkanim','dialogue',true)
        setProperty('pinkanim.visible',true)
        setProperty('dad.visible',false)
        folowcam = true
        camX = -180
        camY = 400

        for i = 1,#hideall do
            doTweenAlpha(hideall[i], hideall[i], 0,0.5,'sineInOut')
        end

        elseif curStep == 1520 then

            for i = 0,3 do
                noteTweenAlpha('e'..i,i,1,0.01)
            end

            for i = 1,#hideall do
                doTweenAlpha(hideall[i], hideall[i], 1,0.01)
                removeSpriteShader(hideall[i])
            end
            beat = 0
            removeLuaSprite('pinkanim',true)
            setProperty('dad.visible',true)
            removeSpriteShader('dad')

    elseif curStep == 1536 then
        setProperty('camGame.alpha', 1)
        setProperty('camHUD.alpha', 1)

    elseif curStep == 1792 then
        setProperty('camHUD.alpha', 0)
        setProperty('vig.alpha', 1)
        setProperty('vig.visible', true)
        triggerEvent('hud','1')
    for i = 1,#chrColor do
        setProperty('dad.colorTransform.'..chrColor[i]..'Offset', 255)
        setProperty('boyfriend.colorTransform.'..chrColor[i]..'Offset', 255)
        setProperty('gf.colorTransform.'..chrColor[i]..'Offset', 255)
    end


        for i = 0,3 do
            noteTweenAlpha('e'..i,i,0,0.01,'sineInOut')
        end

    elseif curStep == 1794 then
        folowcam = true
        camX = -180
        camY = 400


        setProperty('boyfriend.alpha', 0)
        setProperty('boyfriend.x', getProperty('dad.x') + 130)
        setProperty('boyfriend.y', getProperty('dad.y') - 100)

        setObjectCamera('gf', 'other')
        setProperty('gf.x', 500)
        setProperty('gf.y', 250)
        setProperty('gf.alpha', 0)
        setProperty('gf.visible', true)

    elseif curStep == 1796 then
        doTweenAlpha('1', 'camGame', 1, 1, 'sineInOut')
        doTweenAlpha('19', 'camHUD', 1, 1, 'sineInOut')
        noteTweenX('2',4,412,1,'sineInOut')
        noteTweenX('3',5,524,1,'sineInOut')
        noteTweenX('4',6,636,1,'sineInOut')
        noteTweenX('5',7,748,1,'sineInOut')


    elseif curStep == 1936 then
        doTweenAlpha('1', 'boyfriend', 1, 1, 'sineInOut')
        doTweenAlpha('2', 'dad', 0, 1, 'sineInOut')

    elseif curStep == 1980 then
        doTweenAlpha('1', 'boyfriend', 0, 1, 'sineInOut')
        doTweenAlpha('2', 'dad', 1, 1, 'sineInOut')

    elseif curStep == 2016 then
        doTweenAlpha('odj', 'gf', 0.5, 3,'sineInOut')

    elseif curStep == 2040 then
        doTweenAlpha('odj', 'gf', 0, 1.5,'sineInOut')

    elseif curStep == 2080 then
        doTweenAlpha('1', 'camGame', 0, 2, 'sineInOut')
        doTweenAlpha('2', 'camHUD', 0, 2, 'sineInOut')

end

    if dadName == 'SU/pink-steven' then
        setShaderInt(hideall[getRandomInt(1,9)], 'invert', (getShaderInt(hideall[getRandomInt(1,9)], 'invert') == 1 and 0 or 1))
    end

end

inv = 0
iver = false
function opponentNoteHit(id, direction, noteType, isSustainNote)
    if noteType == 'glitch_note' and dadName == 'SU/POV_Steven' then
        setShaderInt('dad', 'invert', 1)
        runTimer('remove', 0.1)
    end


    if noteType == 'glitch_note' and dadName == 'SU/pink-steven' then
        setShaderInt('dad', 'invert', 1)
        setShaderInt('pinkanim', 'invert', 1)
        runTimer('removeall', 0.1)
        for i = 1,9 do
            setShaderInt(hideall[i], 'invert', 1)
        end

        setShaderFloat("Shader1", "AMT", 0.02)
        setShaderFloat("Shader1", "SPEED", 1)
        glit = glit + 0.008
        triggerEvent('AddChrom', 0.5)
    end
end



function onTimerCompleted(t)
    if t == 'remove' then
        setShaderInt('dad', 'invert', 0)
    elseif t == 'removeall' then
        setShaderInt('dad', 'invert', 0)
        for i = 1,9 do
            setShaderInt(hideall[i], 'invert', 0)
        end
    end
end



beat = 0
function onBeatHit()
    if curBeat %4 == 2 and beat == 1 then
        triggerEvent('AddChrom', 2)
    end

    if curBeat %2 == 1 and beat == 2 then
        triggerEvent('AddChrom', 2)
    end
end