xquery version "1.0-ml";
declare namespace n = 'http://marklogic.com/norm/main';

xdmp:document-insert("/admin/config/norm-test.xml",<n:denormalisation>
 <n:name>Family join</n:name>
 <n:description>Joins an immediate family by parent id</n:description>
 <n:uri-pattern>/family/##auto##.xml</n:uri-pattern>
 <n:collections>norm-generated,family</n:collections>
 <n:enabled>true</n:enabled>
 <n:template>
  <n:element name="family">
   <n:element name="person" source="s1" source-path="/person/*" />
  </n:element>
 </n:template>
 
 <n:sources>
  <n:source id="s1" name="person" root-xpath="fn:collection(""people"")" mode="create-update" required="true" combine="true">
   <n:collection-match>people</n:collection-match>
   <n:primary-key><n:element>id</n:element></n:primary-key>
   
   <n:foreign-key primary-entity="s1" key-element="id"><n:element>parentid</n:element></n:foreign-key>
  </n:source>
 </n:sources>
</n:denormalisation>,
xdmp:default-permissions(),"norm-config"
)