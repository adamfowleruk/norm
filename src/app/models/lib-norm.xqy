xquery version "1.0-ml";
(:
 : Norm the Denormaliser control library. Holds server functions to perform denormalisations via triggers.
:)
module namespace n = "http://marklogic.com/norm/main";

(:
 : Externally callable function that takes a new/updated doc URI and generates a set of denormalisations for it.
 :)
declare function n:generate-denormalisations($docuri as xs:string) as xs:boolean* {
  (: Check configuration for matching collection/uri :)
  let $mycollections := xdmp:document-get-collections($docuri)
  let $norms := fn:collection("norm-config")/n:denormalisation[./n:enabled = "true" and ./n:sources/n:source/n:collection-match = $mycollections]
  let $l := xdmp:log(fn:concat("Processing doc: ",$docuri, ", with collections: ",$mycollections, ", and denormalisations:-"))
  let $l := xdmp:log($norms)
  let $normout :=
    for $norm in $norms
    let $changed-source := $norm/n:sources/n:source[./n:collection-match = $mycollections]
    let $l := xdmp:log("Source referencing our new document:-")
    let $l := xdmp:log($changed-source)
    
    (: namespace support in paths and elements :)
    let $nsmap := map:map()
    let $nsmapput :=
      for $ns in $norm/n:namespaces/n:namespace
      return
        map:put($nsmap,xs:string($ns/@prefix),$ns/text())
    let $nsarray :=
      for $ns in $norm/n:namespaces/n:namespace
      return
        (xs:string($ns/@prefix),$ns/text())
    
    let $sources :=
      for $src in $norm/n:sources/n:source
      let $changed-fk := $src/n:foreign-key[./@primary-entity = $changed-source/@id]
      let $l := xdmp:log("Foreign key reference element (MUST exist to be processed):-")
      let $l := xdmp:log($changed-fk)
      
      let $newvalue := 
        if ($src/@id = $changed-source/@id) then
          (: Get our primary key :)
          (
            xdmp:log("Source is for our new document. Returning our primary key value."),
            n:get-primary-key-value-from-document($nsarray,$nsmap,$docuri,$src/n:primary-key)[1] (: TODO handle multiple primary key definitions :)
          )
        else
         (
           xdmp:log("Source is a foreign key reference to our new document"),
           n:get-referenced-primary-key-value($nsarray,$nsmap,$docuri,$changed-fk)
         )
      let $l := xdmp:log(fn:concat("Processing source id: ",$src/@id,", with key value: ",$newvalue))
      
      (:)
      (: See what type of source we have - element or attribute or XPath :)
      let $pktype :=
        if (fn:not(fn:empty($changed-fk/@key-path))) then
          "xpath"
        else
          if (fn:empty($changed-fk/@key-attribute)) then
            "element"
          else
            "element-attribute"
            :)
          (:)
      (: Get the 'primary key' value of our new document - this is referenced by other source configurations and used to find dependant existing documents :)
      let $newvalue := 
        if ($pktype = "element") then
          cts:element-values(xs:QName($changed-fk/@key-element),(),("type=string","collation=http://marklogic.com/collation/codepoint"),cts:document-query($docuri))
        else if ($pktype = "xpath") then
          cts:values(cts:path-reference($changed-fk/@key-path),(),("collation=http://marklogic.com/collation/codepoint"),cts:document-query($docuri))
        else
          cts:element-attribute-values(xs:QName($changed-fk/@key-element),xs:QName($changed-fk/@key-attribute),(),("type=string","collation=http://marklogic.com/collation/codepoint"),cts:document-query($docuri) )
    :)
    
      (: Find dependent documents :)
      let $srcdocs := 
        
        let $hasshreds := fn:not(fn:empty($src/@shred))
        let $docuris := 
         (
          if ($src/@id = $changed-source/@id) then
            $docuri
          else () , (: We do both because a source may reference itself with a foreign key relationship :)
            let $fktype :=
              if (fn:not(fn:empty($changed-fk/n:path))) then
                "xpath"
              else
                if (fn:empty($changed-fk/n:attribute)) then
                  "element"
                else
                  "element-attribute"
            let $l := xdmp:log(fn:concat("FK type: ",$fktype))
            return
              if ($fktype = "element") then
                for $doc in cts:search(fn:collection($src/n:collection-match),
                  cts:element-range-query(
                    fn:QName(map:get($nsmap,$src/n:foreign-key/n:ns/text()),
                    $src/n:foreign-key/n:element), "=",$newvalue,("collation=http://marklogic.com/collation/codepoint")
                  )
                )
                return $doc/fn:base-uri(.)  
              else if ($fktype = "xpath") then
                for $doc in cts:search(fn:collection($src/n:collection-match),
                  cts:path-range-query($changed-fk/n:path,"=",$newvalue,("collation=http://marklogic.com/collation/codepoint")) (: Prefixes must be same as in DB config if using Path range indexes :)
                )
                return $doc/fn:base-uri(.)
              else
                for $doc in cts:search(fn:collection($src/n:collection-match),
                  cts:element-attribute-range-query(
                    fn:QName(map:get($nsmap,$src/n:foreign-key/n:ns/text()),$src/n:foreign-key/n:element),
                    fn:QName((:map:get($nsmap,$src/n:foreign-key/n:ns/text()):) "",$src/n:foreign-key/n:attribute),
                    "=", $newvalue,("collation=http://marklogic.com/collation/codepoint")
                  )
                )
                return $doc/fn:base-uri(.)
           )
        return
          for $du in $docuris
          let $up := fn:concat("fn:doc(""" , $du , """)", $src/@shred)
          let $l := xdmp:log(fn:concat("Shredding xpath: ", $up))
          let $shreds := if ($hasshreds) then fn:count(xdmp:with-namespaces($nsarray,xdmp:unpath($up))) else 1 
          return
            if ($hasshreds) then
              for $shred in (1 to $shreds)
              return
                <uri shredindex="{$shred}" shredpath="{$src/@shred}">{$du}</uri>
            else
              <uri>{$du}</uri>
            
            
        
      let $sourceinfo := <source-info>{$src}<docs>{$srcdocs}</docs></source-info>
      let $l := xdmp:log(fn:concat("Source info (prior to processing):-"))
      let $l := xdmp:log($sourceinfo)
      return
        $sourceinfo
        
    (: Generate and save denormalisation in new document :)
    (: Ensure all required exist - @required :)
    (: TODO handle optional dependant documents (empty docs element in source-info) :)
    let $gotrequired :=
      for $si in $sources
      return
        if (fn:empty($si/n:source/@required) or (: no required flag, therefore optional :)
            $si/n:source/@required = "false" or (: required set explicitly to false :)
            ($si/n:source/@required = "true" and fn:not(fn:empty($si/docs)))) then (: required and has content :)
          fn:true()
        else (: required and no content exists :)
          (xdmp:log(fn:concat("WARNING: Source required attribute is invalid: ", $si/n:source/@id)),
          fn:false())
    let $allrequired := fn:not($gotrequired = fn:false())
    let $l := xdmp:log(fn:concat("Got all required child docs for new denormalisation to be created?: ", $allrequired))
    let $normsdone := map:map()
    
    return
      (: Generate denormalisation :)
      if (fn:not($allrequired)) then (
        xdmp:log("Not generating any denormalisations - not all required fields were present")
        ) (: TODO log this and why a denormalisation wasn't generated, along with source-info :)
      else
        (: TODO check for multiple docs in one or more sources and generate multiple docs accordingly :)
        let $log := xdmp:log("SOURCES TO PROCESS:-")
        let $log := xdmp:log($sources)
        let $combos := n:source-combinations($sources,1,map:map())
        let $l := xdmp:log("Source processed combinations:-")
        let $l := xdmp:log($combos)
        return
          for $c in $combos
          let $denormuri := n:generateuri($nsarray,$nsmap,$changed-source,$c/source-info,$norm/n:uri-pattern)
          let $duplicate := fn:not(fn:empty(map:get($normsdone,$denormuri))) (: sanity check - possible with bad fk/pk config :)
          let $denorm := 
            if ($duplicate) then (
              xdmp:log(fn:concat("DUPLICATE DENORMALISATION DOCUMENT - SKIPPING. URI ", $denormuri))
            ) else 
              n:generate-element($nsarray,$nsmap,$changed-source,$c/source-info,$norm/n:template/n:element)
          let $l := xdmp:log(fn:concat("generated denormalisation at uri: ",$denormuri))
          let $l := xdmp:log($denorm)
          let $nd := map:put($normsdone,$denormuri,"done")
          return
            if ($duplicate) then 
              fn:true()
            else
              fn:empty(xdmp:document-insert($denormuri,$denorm,xdmp:default-permissions(),fn:tokenize($norm/n:collections/text(),",")))

  return $normout
};

declare function n:list-indexes-required($config-uri as xs:string) as element()* {
  let $norm := fn:doc($config-uri)/n:denormalisation
  let $nsmap := map:map()
  let $nsmapput :=
    for $ns in $norm/n:namespaces/n:namespace
    return
      map:put($nsmap,xs:string($ns/@prefix),$ns/text())
  return
   (
   for $pk in $norm/n:sources/n:source/n:primary-key
   let $type := n:pktype($pk)
   return
    if ("element" = $type) then
      <index>{$pk/*}<type>xs:string</type><collation>http://marklogic.com/collation/codepoint</collation>
      {
        if (fn:empty($pk/n:ns)) then () else
        <namespace><prefix>{$pk/n:ns/text()}</prefix><value>{map:get($nsmap,$pk/n:ns/text())}</value></namespace>
      }
      </index>
    else if ("xpath" = $type) then
      <index>{$pk/*}<type>xs:string</type><collation>http://marklogic.com/collation/codepoint</collation>
      {
        if (fn:empty($pk/n:ns)) then () else
        <namespace><prefix>{$pk/n:ns/text()}</prefix><value>{map:get($nsmap,$pk/n:ns/text())}</value></namespace>
      }</index>
    else
      <index>{$pk/*}<type>xs:string</type><collation>http://marklogic.com/collation/codepoint</collation>
      {
        if (fn:empty($pk/n:ns)) then () else
        <namespace><prefix>{$pk/n:ns/text()}</prefix><value>{map:get($nsmap,$pk/n:ns/text())}</value></namespace>
      }</index>
  
  ,
  
  for $fk in fn:doc($config-uri)/n:denormalisation/n:sources/n:source/n:foreign-key
  let $type := n:fktype($fk)
  return
    if ("element" = $type) then
      <index>{$fk/*}<type>xs:string</type><collation>http://marklogic.com/collation/codepoint</collation>
      {
        if (fn:empty($fk/@key-ns)) then () else
        <namespace><prefix>{xs:string($fk/@key-ns)}</prefix><value>{map:get($nsmap,xs:string($fk/@key-ns))}</value></namespace>
      }</index>
    else if ("xpath" = $type) then
      <index>{$fk/*}<type>xs:string</type><collation>http://marklogic.com/collation/codepoint</collation>
      {
        if (fn:empty($fk/@key-ns)) then () else
        <namespace><prefix>{xs:string($fk/@key-ns)}</prefix><value>{map:get($nsmap,xs:string($fk/@key-ns))}</value></namespace>
      }</index>
    else
      <index>{$fk/*}<type>xs:string</type><collation>http://marklogic.com/collation/codepoint</collation>
      {
        if (fn:empty($fk/@key-ns)) then () else
        <namespace><prefix>{xs:string($fk/@key-ns)}</prefix><value>{map:get($nsmap,xs:string($fk/@key-ns))}</value></namespace>
      }</index>
      
  ,
      
  if (fn:not(fn:empty(fn:doc($config-uri)/n:denormalisation/n:sources/n:source/n:collection-match))) then
    (<lexicon>collection</lexicon>,
    <lexicon>uri</lexicon>)
  else ()
  (:)
  ,
  for $ns in fn:doc($config-uri)/n:denormalisation/n:namespaces/n:namespace
  return
    <namespace><prefix>{$ns/@prefix/fn:data()}</prefix><value>{$ns/text()}</value></namespace>
    :)
)  
};



(: ---------- INTERNAL ONLY FUNCTIONS BEYOND THIS POINT ---------- :)

(:
xdmp:with-namespaces($nsarray,
:)

declare function n:get-document-value($nsarray as xs:string*,$nsmap as map:map,$docuri as xs:string,$ns as xs:string?,$xpath as xs:string?,$element as xs:string?,$attribute as xs:string?) {
  let $type :=
    if (fn:not(fn:empty($xpath))) then
      "xpath"
    else
      if (fn:empty($attribute)) then
        "element"
      else
        "element-attribute"
          
  (: Get the value of our document's element - this is referenced by other source configurations and used to find dependant existing documents :)
  return
    if ($type = "element") then
      cts:element-values(fn:QName(map:get($nsmap,$ns),$element),(),("type=string","collation=http://marklogic.com/collation/codepoint"),cts:document-query($docuri))
    else if ($type = "xpath") then
      (:
        cts:values(cts:path-reference($xpath),(),("collation=http://marklogic.com/collation/codepoint"),cts:document-query($docuri))
      :)
      xdmp:with-namespaces($nsarray,xdmp:unpath(fn:concat("fn:doc(""" , $docuri , """)", $xpath)))
    else
    let $l := xdmp:log(fn:concat("***** NS NAME: ",xs:string($ns), " = ", map:get($nsmap,$ns)))
    return
      cts:element-attribute-values(
        fn:QName(map:get($nsmap,$ns),$element),
        fn:QName((:map:get($nsmap,$ns):) "",$attribute),
        (),("type=string","collation=http://marklogic.com/collation/codepoint"),cts:document-query($docuri) 
      )
};

declare function n:get-primary-key-value-from-document($nsarray as xs:string*,$nsmap as map:map,$docuri,$primary-key as element(n:primary-key)) as xs:string? {
  n:get-document-value($nsarray,$nsmap,$docuri,$primary-key/n:ns,$primary-key/n:path,$primary-key/n:element,$primary-key/n:attribute)
};

declare function n:get-referenced-primary-key-value($nsarray as xs:string*,$nsmap as map:map,$docuri,$foreign-key as element(n:foreign-key)) as xs:string? {
  n:get-document-value($nsarray,$nsmap,$docuri,$foreign-key/@key-ns,$foreign-key/@key-path,$foreign-key/@key-element,$foreign-key/@key-attribute)
};



declare function n:pktype($primary-key as element(n:primary-key)) as xs:string {
      if (fn:not(fn:empty($primary-key/n:path))) then
        "xpath"
      else
        if (fn:empty($primary-key/n:attribute)) then
          "element"
        else
          "element-attribute"
};


declare function n:fktype($foreign-key as element(n:foreign-key)) as xs:string {
      if (fn:not(fn:empty($foreign-key/@key-path))) then
        "xpath"
      else
        if (fn:empty($foreign-key/@key-attribute)) then
          "element"
        else
          "element-attribute"
};

(:
 : Takes a list of sources (from a single combo element) and a uripattern and generates the URI for a new denormalisation.
 :)
declare function n:generateuri($nsarray as xs:string*,$nsmap as map:map,$changed-source as element(n:source),$sources as element(source-info)*,$uripattern as xs:string) as xs:string {
  (: Generate map :)
  let $map := map:map()
  let $mp := map:put($map,"##auto##",xs:string(xdmp:random()))
  let $mapfill :=
    for $source in $sources[fn:count(./docs/uri) gt 0]
    return
      (
        map:put($map,fn:concat("##",xs:string($source/n:source/@id),":uri##"),xs:string($source/docs/uri[1])), (: We only ever pass the first URI to this macro :)
    
      for $pk at $pos in $source/n:source/n:primary-key
      let $idx := xs:string(($pk/@order,$pos)[1])
      let $pkval := n:get-primary-key-value-from-document($nsarray,$nsmap,$source/docs/uri[1],$pk) (: TODO handle multiple source docs (i.e. denormalistion should include both docs) - do not allow PJ in this scenario :)
      order by xs:integer($pk/@order) ascending
      return (
        xdmp:log(fn:concat("replacing instances of: ", xs:string($source/n:source/@id), " with ", $pkval)),
        if ("1" = $idx) then map:put($map,fn:concat("##",xs:string($source/n:source/@id),":pk##"), $pkval) else (),
        map:put($map,fn:concat("##",xs:string($source/n:source/@id),":pk:", $idx, "##"), $pkval )
      )
      )
  
  (: Generate URI based on Map :)
  (:)
  let $mapout := map:map()
  let $mapfill2 := map:put($mapout,"string",$uripattern)
  let $replaceloopout :=
    for $key in map:keys($map)
    return
      (
        xdmp:log(fn:concat("Replacing key: ",$key," with: ",map:get($map,$key))),
        map:put($mapout,"string",fn:replace(map:get($mapout,"string"),$key,map:get($map,$key)))
      )
  let $log := xdmp:log(fn:concat("Final URI: ",map:get($mapout,"string")))
  return map:get($mapout,"string")
  :)
  let $uri := n:doreplace($map,1,$uripattern)
  let $log := xdmp:log(fn:concat("Final URI now: ",$uri))
  return $uri
};

declare function n:doreplace($map as map:map,$index as xs:integer,$replace as xs:string) as xs:string {
  let $key := map:keys($map)[$index]
  return (xdmp:log(fn:concat("replacing key: ",$key," with: ",map:get($map,$key))),
    if (fn:count(map:keys($map)) = $index) then
    (xdmp:log("final replace"),
      fn:replace($replace,$key,map:get($map,$key)))
    else
    (xdmp:log("not final replace"),
      fn:replace(n:doreplace($map,$index + 1,$replace),$key,map:get($map,$key))
      )
  )
};

(:
 : source info elements may each have more than one document. This means for three sources with number of documents x, y and z,
 : the number of denormalisations required will be x * y *z. This function therefore generates combo sets of source-info
 : elements with just one document in each, thus combo holds data required for one denormalisation each.
 :)
declare function n:source-combinations($sources as element()*,$mynum as xs:integer,$map as map:map) as element()* {
  if ($mynum > fn:count($sources)) then
    let $l := xdmp:log(fn:concat("Generating combo :-"))
    return
     element combo {
      for $key in map:keys($map)
      let $src := $sources[xs:integer($key)]
      let $l := xdmp:log(fn:concat($key,"=",fn:string-join(
        (for $v in map:get($map,$key) 
        return xs:string($v)),","
      )))
      order by xs:integer($key) ascending
      return
        element source-info {
          $src/n:source,
          element docs {
            for $pos in map:get($map,$key) (: normally 1, but multiple if combining docs from one source :)
            return $src/docs/uri[$pos]
          }
        }
    }
  else
    let $mysource := $sources[$mynum]
    let $mysize := fn:count($mysource/docs/uri)
    let $l := xdmp:log(fn:concat("Processing source: ",$mysource/n:source/@id,", mysize = ",$mysize))
    let $mycount := if (0 = $mysize) then 1 else $mysize
    let $l := xdmp:log(fn:concat("Mycount = ",$mycount))
    let $options :=
      if ($mysource/n:source/@combine = "true") then
        (: Support for multiple docs combined in a single source :)
        let $mapchange := map:put($map,xs:string($mynum),(1 to $mycount))
        return
          n:source-combinations($sources,$mynum + 1,$map)
      else
        for $i in (1 to $mycount)
        let $mapchange := map:put($map,xs:string($mynum),$i)
        return
          n:source-combinations($sources,$mynum + 1,$map)
    return $options
};

(:
 : Recursive function to generate an element from a template definition. Can be the root element.
 :)
declare function n:generate-element($nsarray as xs:string*,$nsmap as map:map,$changed-source as element(n:source),$sources as element(source-info)*,$normel as element(n:element)) as node()* {
  if (fn:empty($normel/@source)) then
    n:generate-element-content($nsarray,$nsmap,$changed-source,$sources,$normel,())
  else
    let $src := $sources[./n:source/@id = $normel/@source]
    return
      for $uri in $src/docs/uri
      return
        n:generate-element-content($nsarray,$nsmap,$changed-source,$sources,$normel,$uri)
};

declare function n:generate-element-content($nsarray as xs:string*,$nsmap as map:map,$changed-source as element(n:source),$sources as element(source-info)*,$normel as element(n:element),$uri as element(uri)?) as node()* {
  
  element {fn:QName(map:get($nsmap,xs:string($normel/@ns)),xs:string($normel/@name))} {
    (
      for $attr in $normel/n:attribute
      return
        n:generate-attribute($nsarray,$nsmap,$changed-source,$sources,$attr)
    ),
    (
      for $el in $normel/n:element
      return
        n:generate-element($nsarray,$nsmap,$changed-source,$sources,$el)
    ),
    (
      (: now generate THIS element's content :)
        (: let $doccontent := fn:doc(xs:string($src/docs/uri)){$normel/n:source-path} (: validate this dynamic use :) :)
        (:let $doccontent := 
          cts:search(fn:collection($src/n:collection-match),
            cts:document-query(xs:string($src/docs/uri))
          ):)
        (: Now apply XPath to Document to get content to insert into denormalisation :)
        
          (:)
          if (fn:empty($src/docs/uri)) then () else
          :)
          if (fn:empty($uri)) then () else
            let $l := xdmp:log("Extracting content from URI:- ")
            let $l := xdmp:log($uri)
            (: TODO check for shred reference - shredindex and shredpath :)
            return
              (: Check that we overlap with the target xpath :)
              if (fn:empty($uri/@shredindex) or fn:not(fn:contains($normel/@source-path,$uri/@shredpath))) then
                let $path := fn:concat("fn:doc(""" , $uri , """)", $normel/@source-path)
                let $l := xdmp:log(fn:concat("Calling unpath on: ",$path, " for URI: ",$uri))
                return xdmp:with-namespaces($nsarray,xdmp:unpath($path))
              else
                (: Get parent element's content, except the matching local name :)
                let $tokens := fn:tokenize($uri/@shredpath,"/")
                let $firstpath := fn:string-join($tokens[1 to (fn:count($tokens) - 1)],"/")
                let $endpath := xs:string($tokens[fn:count($tokens)])
                let $postmatch := fn:substring-after(xs:string($normel/@source-path),xs:string($uri/@shredpath))
                (:
                let $matchparentcontentpath := fn:concat($firstpath,"/element()")
                :)
                let $matchparentcontentpath := fn:concat($uri/@shredpath (:),"/element()":))
                let $l := xdmp:log(fn:concat("Parent content path: ", $matchparentcontentpath))
                let $l := xdmp:log(fn:concat("Local name to match: ", $endpath))
                return
                  
                    
                      let $path := fn:concat("fn:doc(""" , $uri , """)", $uri/@shredpath, "[", $uri/@shredindex,"]",$postmatch)
                      let $l := xdmp:log(fn:concat("Calling unpath on: ",$path, " for URI: ",$uri))
                      return xdmp:with-namespaces($nsarray,xdmp:unpath($path))
                      
               
    ),
    (
      $normel/n:static/*
    )
  }
};

(:
 : Recursive leaf function called by generate-element that creates an attribute from a template definition.
 :)
declare function n:generate-attribute($nsarray as xs:string*,$nsmap as map:map,$changed-source as element(n:source),$sources as element(source-info)*,$normel as element(n:attribute)) as node()* {
  attribute {fn:QName(map:get($nsmap,xs:string($normel/@ns)),xs:string($normel/@name))} {
      if (fn:not(fn:empty($normel/@source))) then
        let $src := $sources[./n:source/@id = $normel/@source]
        (: let $doccontent := $src/docs/{$normel/n:source-path} (: validate this dynamic use :) :)
        return
          if (fn:empty($src/docs/uri)) then () else
            let $path := fn:concat("fn:doc(""" , $src/docs/uri , """)", $normel/@source-path)
            let $l := xdmp:log(fn:concat("Calling unpath on: ",$path))
            return xdmp:with-namespaces($nsarray,xdmp:unpath($path))
      else ()
  }
};

