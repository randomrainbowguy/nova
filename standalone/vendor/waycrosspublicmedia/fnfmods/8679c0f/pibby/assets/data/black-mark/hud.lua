function onCreatePost()
    for i = 0,3 do
        noteTweenAlpha("yes"..i, i, 0, 0.01)
    end

    setPropertyFromGroup('strumLineNotes', 4, 'x',412)
    setPropertyFromGroup('strumLineNotes', 5, 'x',524)
    setPropertyFromGroup('strumLineNotes', 6, 'x',636)
    setPropertyFromGroup('strumLineNotes', 7, 'x',748)

    setProperty('healthBar.angle',90)
    setProperty('healthBar.x',-160)
    setProperty('iconP1.flipX',true)
    scaleObject('healthBar',0.8,1)
    scaleObject('healthBarBG',0.8,1)
    screenCenter('healthBar','y')
end


function onUpdatePost()
    setProperty('iconP1.y',getProperty('healthBar.percent') * -4.808 + 580.8)

    setProperty('iconP2.y',getProperty('healthBar.percent') * -4.808 + 480.8)


    setProperty('iconP1.x',0)
    setProperty('iconP2.x',0)
end
