function onCreatePost()
setHealthBarColors('332f2c', 'FFFF00')

makeLuaSprite('health', 'hpBar', 320, 620);
addLuaSprite('health', false)
setObjectCamera('health', 'HUD')
scaleObject('health', 1, 1)
setProperty('health.visible', true)

scaleObject('healthBar', 1.04, 3)

scaleObject('scoreTxt', 1, 1)

end

function onUpdatePost()
setObjectOrder('healthBar', getObjectOrder('healthBar')+1)
setObjectOrder('health', getObjectOrder('health')+2)

setObjectOrder('iconP1', getObjectOrder('iconP1')+3)
setObjectOrder('iconP2', getObjectOrder('iconP2')+4)

setObjectOrder('scoreTxt', getObjectOrder('scoreTxt')+5)

if downscroll then
setProperty('health.y', 60)
setProperty('healthBar.y', 70)
setProperty('scoreTxt.y', 120)

setProperty(‘health.angle’, 180)
 end
end

function onUpdate()
setProperty('healthBar.y', 633)
setProperty('scoreTxt.y', 690)
end