function onCreate()
    makeAnimatedLuaSprite('Steven_block', 'special_Anims/block')
    addAnimationByPrefix('Steven_block', 'Block', 'Block',24,false)
    scaleObject('Steven_block', 0.8, 0.8)
    addLuaSprite('Steven_block',true)
    setProperty('Steven_block.offset.x', -113)
    setProperty('Steven_block.offset.y', 175)
end

function onCreatePost()
    setProperty('Steven_block.visible', false)
    setProperty('Steven_block.x', getProperty('dad.x'))
    setProperty('Steven_block.y', getProperty('dad.y'))
end


function onStepHit()
    if curStep == 607 then
        removeLuaSprite('Steven_block',true)
    end
end