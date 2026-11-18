function onStepHit()
    if curStep == 1020 then

        setProperty('gf.alpha', 0)
        setProperty('boyfriend.alpha', 0)
        setProperty('dad.alpha', 0)
        setProperty('boyfriend.x', 1000)
        setProperty('boyfriend.y', 250)

        setProperty('dad.x', -300)
        setProperty('dad.y', 150)

        setProperty('dad.velocity.x', 55)

        setProperty('GBG.visible', false)
        setProperty("dad.colorTransform.color", 0xffffff)
        setProperty("boyfriend.colorTransform.color", 0xffffff)
        setProperty("gf.colorTransform.color", 0xffffff)

    elseif curStep == 1024 then
        setObjectCamera('dad', 'hud')
        doTweenAlpha('1', 'dad', 1, 2, 'sineInOut')
        doTweenAlpha('2', 'camGame', 1, 2, 'sineInOut')

    elseif curStep == 1084 then
        setProperty('boyfriend.velocity.x', -55)
        setObjectCamera('boyfriend', 'hud')
        doTweenAlpha('1', 'dad', 0, 1, 'sineInOut')

    elseif curStep == 1088 then
        doTweenAlpha('2', 'boyfriend', 1, 1, 'sineInOut')

    elseif curStep == 1105 then
        setObjectCamera('dad', 'game')

    elseif curStep == 1148 then
        doTweenAlpha('1', 'boyfriend', 0, 0.5, 'sineInOut')
        doTweenAlpha('2', 'camGame', 0, 0.5, 'sineInOut')

    elseif curStep == 1153 then
        setProperty('dad.velocity.x', 0)
        setProperty('boyfriend.velocity.x', 0)
        setObjectCamera('boyfriend', 'game')
        setProperty('boyfriend.x', defaultBoyfriendX + 100)
        setProperty('boyfriend.y', defaultBoyfriendY + 350)

        setProperty('dad.x', defaultOpponentX - 210)
        setProperty('dad.y', defaultOpponentY + 190)

    elseif curStep == 1154 then
        doTweenAlpha('1', 'boyfriend', 1, 1, 'sineInOut')
        doTweenAlpha('2', 'camGame', 1, 1, 'sineInOut')
        doTweenAlpha('3', 'dad', 1, 1, 'sineInOut')
        doTweenAlpha('4', 'gf', 1, 1, 'sineInOut')
    end
end