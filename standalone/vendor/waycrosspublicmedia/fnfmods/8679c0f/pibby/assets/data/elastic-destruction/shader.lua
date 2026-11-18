function onCreatePost()
makeLuaSprite("Shader3")
setSpriteShader("Shader3", "old film")

runHaxeCode([[
trace(ShaderFilter);
game.camGame.setFilters([new ShaderFilter(game.getLuaObject("Shader3").shader)]);
		]])
end


function onUpdatePost()
if curStep > 1 and curStep < 127 then
setShaderFloat("Shader3", "iTime", os.clock())
end

if curStep == 127 then
runHaxeCode([[
trace(ShaderFilter);
game.camGame.setFilters([new ShaderFilter(game.getLuaObject("Shader1").shader),new ShaderFilter(game.getLuaObject("Shader2").shader)]);
		]])
end
end